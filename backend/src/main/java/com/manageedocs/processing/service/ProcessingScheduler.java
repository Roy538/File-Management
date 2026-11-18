package com.manageedocs.processing.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The pipeline's second entry point: no HTTP request, no caller, no SecurityContext. Each job
 * carries its own tenant. Disabled where it would race tests ({@code poller-enabled: false}).
 */
@Component
public class ProcessingScheduler {

    private static final Logger log = LoggerFactory.getLogger(ProcessingScheduler.class);

    private final ProcessingWorker worker;
    private final ProcessingProperties props;

    public ProcessingScheduler(ProcessingWorker worker, ProcessingProperties props) {
        this.worker = worker;
        this.props = props;
    }

    @Scheduled(fixedDelayString = "${manageedocs.processing.poll-interval:PT5S}")
    void poll() {
        if (!props.pollerEnabled()) return;
        try {
            worker.drain();
        } catch (RuntimeException e) {
            log.error("Processing poll failed", e);
        }
    }

    @Scheduled(fixedDelayString = "${manageedocs.processing.reap-interval:PT1M}")
    void reap() {
        if (!props.pollerEnabled()) return;
        try {
            worker.reapStale();
        } catch (RuntimeException e) {
            log.error("Processing reaper failed", e);
        }
    }
}
