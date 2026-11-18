package com.manageedocs.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/** S3-compatible adapter (AWS S3 in production, MinIO locally). */
@Component
public class S3StorageAdapter implements StoragePort, ApplicationRunner, AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(S3StorageAdapter.class);

    private final StorageProperties props;
    private final S3Client s3;
    private final S3Presigner presigner;
    private final boolean encrypt;

    public S3StorageAdapter(StorageProperties props) {
        this.props = props;
        var creds = StaticCredentialsProvider.create(AwsBasicCredentials.create(props.accessKey(), props.secretKey()));
        var s3cfg = S3Configuration.builder().pathStyleAccessEnabled(props.pathStyle()).build();
        this.s3 = S3Client.builder()
                .endpointOverride(URI.create(props.endpoint()))
                .region(Region.of(props.region()))
                .credentialsProvider(creds)
                .serviceConfiguration(s3cfg)
                .build();
        this.presigner = S3Presigner.builder()
                .endpointOverride(URI.create(props.effectivePublicEndpoint()))
                .region(Region.of(props.region()))
                .credentialsProvider(creds)
                .serviceConfiguration(s3cfg)
                .build();
        // Real S3 encrypts at rest when asked; plain local MinIO without KMS rejects SSE headers.
        this.encrypt = props.endpoint().contains("amazonaws.com");
    }

    /** Creates the bucket on startup if missing; a failure is logged, not fatal. */
    @Override
    public void run(ApplicationArguments args) {
        try {
            s3.headBucket(b -> b.bucket(props.bucket()));
        } catch (NoSuchBucketException e) {
            createBucket();
        } catch (S3Exception e) {
            if (e.statusCode() == 404) {
                createBucket();
            } else {
                log.warn("Object storage check failed (HTTP {}); uploads will fail until it is reachable", e.statusCode());
            }
        } catch (RuntimeException e) {
            log.warn("Object storage unreachable at startup: {}", e.getClass().getSimpleName());
        }
    }

    private void createBucket() {
        s3.createBucket(b -> b.bucket(props.bucket()));
        log.info("Created storage bucket {}", props.bucket());
    }

    @Override
    public void put(String key, InputStream content, long size, String contentType) {
        s3.putObject(b -> {
            b.bucket(props.bucket()).key(key).contentType(contentType).contentLength(size);
            if (encrypt) b.serverSideEncryption(ServerSideEncryption.AES256);
        }, RequestBody.fromInputStream(content, size));
    }

    @Override
    public InputStream get(String key) {
        return s3.getObject(b -> b.bucket(props.bucket()).key(key));
    }

    @Override
    public void copy(String sourceKey, String targetKey) {
        s3.copyObject(b -> {
            b.sourceBucket(props.bucket()).sourceKey(sourceKey)
                    .destinationBucket(props.bucket()).destinationKey(targetKey);
            if (encrypt) b.serverSideEncryption(ServerSideEncryption.AES256);
        });
    }

    @Override
    public java.util.stream.Stream<String> listKeys(String prefix, java.time.Instant olderThan) {
        return s3.listObjectsV2Paginator(b -> b.bucket(props.bucket()).prefix(prefix)).contents().stream()
                .filter(o -> o.lastModified().isBefore(olderThan))
                .map(software.amazon.awssdk.services.s3.model.S3Object::key);
    }

    @Override
    public boolean deleteQuietly(String key) {
        try {
            s3.deleteObject(b -> b.bucket(props.bucket()).key(key));
            return true;
        } catch (RuntimeException e) {
            log.warn("Could not delete object during compensation (orphan left for reconciliation): {}",
                    e.getClass().getSimpleName());
            return false;
        }
    }

    @Override
    public URI presignedDownload(String key, String downloadName, String contentType, Duration ttl, boolean inline) {
        // RFC 6266 / 5987: ASCII fallback plus a UTF-8 filename* for non-ASCII names.
        String ascii = downloadName.replaceAll("[^\\x20-\\x7E]", "_").replace("\"", "");
        String utf8 = URLEncoder.encode(downloadName, StandardCharsets.UTF_8).replace("+", "%20");
        String disposition = (inline ? "inline" : "attachment")
                + "; filename=\"" + ascii + "\"; filename*=UTF-8" + "''" + utf8;
        return URI.create(presigner.presignGetObject(p -> p
                        .signatureDuration(ttl)
                        .getObjectRequest(g -> g.bucket(props.bucket()).key(key)
                                .responseContentDisposition(disposition)
                                .responseContentType(contentType)))
                .url().toString());
    }

    @Override
    public void close() {
        presigner.close();
        s3.close();
    }
}
