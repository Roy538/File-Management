package com.manageedocs.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class TimeConfig {

    /** Injected everywhere "now" matters so tests can control time (lockout, expiry, retention). */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
