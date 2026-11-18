package com.manageedocs.processing.service;

import com.manageedocs.processing.model.ProcessingJob.ScanResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class ScannerConfig {

    private static final Logger log = LoggerFactory.getLogger(ScannerConfig.class);

    /**
     * ClamAV when {@code CLAMAV_HOST} is set. Otherwise scanning is explicitly SKIPPED — recorded
     * per version so nobody mistakes "not scanned" for "clean".
     */
    @Bean
    @ConditionalOnMissingBean(MalwareScanner.class)
    MalwareScanner malwareScanner(ProcessingProperties props) {
        if (props.scanningEnabled()) {
            log.info("Malware scanning enabled via clamd at {}:{}", props.clamavHost(), props.clamavPort());
            return new ClamAvScanner(props.clamavHost(), props.clamavPort(), (int) props.clamavTimeout().toMillis());
        }
        log.warn("Malware scanning is DISABLED (no CLAMAV_HOST). Uploads will be marked scan=SKIPPED.");
        return content -> new MalwareScanner.Verdict(ScanResult.SKIPPED, null);
    }
}
