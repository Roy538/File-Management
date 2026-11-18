package com.manageedocs.processing.service;

import com.manageedocs.processing.model.ProcessingJob.ScanResult;

import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * clamd INSTREAM client: {@code zINSTREAM\0}, then chunks of [4-byte big-endian length][bytes],
 * terminated by a zero-length chunk; the reply is {@code stream: OK} or {@code stream: <sig> FOUND}.
 * Anything else (including clamd's size-limit error) is treated as a failure to scan, never as clean.
 */
public class ClamAvScanner implements MalwareScanner {

    private static final int CHUNK = 64 * 1024;

    private final String host;
    private final int port;
    private final int timeoutMillis;

    public ClamAvScanner(String host, int port, int timeoutMillis) {
        this.host = host;
        this.port = port;
        this.timeoutMillis = timeoutMillis;
    }

    @Override
    public Verdict scan(InputStream content) throws IOException {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), timeoutMillis);
            socket.setSoTimeout(timeoutMillis);
            DataOutputStream out = new DataOutputStream(socket.getOutputStream());
            out.write("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));
            byte[] buf = new byte[CHUNK];
            int n;
            while ((n = content.read(buf)) > 0) {
                out.writeInt(n);
                out.write(buf, 0, n);
            }
            out.writeInt(0);
            out.flush();
            String reply = new String(socket.getInputStream().readAllBytes(), StandardCharsets.US_ASCII)
                    .replace("\0", "").trim();
            return parse(reply);
        }
    }

    static Verdict parse(String reply) throws IOException {
        if (reply.endsWith("OK")) return new Verdict(ScanResult.CLEAN, null);
        if (reply.endsWith("FOUND")) {
            String sig = reply.substring(reply.indexOf(':') + 1, reply.length() - "FOUND".length()).trim();
            return new Verdict(ScanResult.INFECTED, sig);
        }
        throw new IOException("Unexpected scanner reply: " + (reply.length() > 120 ? reply.substring(0, 120) : reply));
    }
}
