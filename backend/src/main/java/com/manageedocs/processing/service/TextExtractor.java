package com.manageedocs.processing.service;

import org.apache.tika.exception.WriteLimitReachedException;
import org.apache.tika.metadata.Metadata;
import org.apache.tika.parser.AutoDetectParser;
import org.apache.tika.parser.ParseContext;
import org.apache.tika.sax.BodyContentHandler;
import org.springframework.stereotype.Component;

import java.io.InputStream;

/**
 * Plain-text extraction (PDF, Office, text) via Apache Tika. Bounded: text beyond the limit is
 * dropped and reported as truncated rather than exhausting memory on a huge file.
 */
@Component
public class TextExtractor {

    public record Extracted(String text, boolean truncated) {
    }

    private final AutoDetectParser parser = new AutoDetectParser();

    public Extracted extract(InputStream content, String contentType, int maxChars) throws Exception {
        BodyContentHandler handler = new BodyContentHandler(maxChars);
        Metadata metadata = new Metadata();
        metadata.set(Metadata.CONTENT_TYPE, contentType);
        boolean truncated = false;
        try {
            parser.parse(content, handler, metadata, new ParseContext());
        } catch (Exception e) {
            if (!WriteLimitReachedException.isWriteLimitReached(e)) throw e;
            truncated = true;
        }
        String text = handler.toString().replaceAll("[\\t\\x0B\\f\\r ]+", " ").replaceAll("\\n{3,}", "\n\n").trim();
        return new Extracted(text, truncated);
    }
}
