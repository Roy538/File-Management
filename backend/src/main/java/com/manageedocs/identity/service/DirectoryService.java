package com.manageedocs.identity.service;

import com.manageedocs.identity.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;

@Service
public class DirectoryService {

    public static final int MAX_IDS = 100;

    /** Name only. Deactivated people are still named: history must stay readable after someone leaves. */
    public record Person(UUID id, String fullName, boolean active) {
    }

    private final UserRepository users;

    public DirectoryService(UserRepository users) {
        this.users = users;
    }

    /** Tenant-scoped lookup: ids from another organisation simply do not resolve. */
    @Transactional(readOnly = true)
    public List<Person> people(List<UUID> ids) {
        if (ids.size() > MAX_IDS) throw new IllegalArgumentException("Ask for at most " + MAX_IDS + " people at a time");
        return users.findAllById(new LinkedHashSet<>(ids)).stream()
                .map(u -> new Person(u.getId(), u.getFullName(), u.isActive()))
                .sorted((a, b) -> a.fullName().compareToIgnoreCase(b.fullName()))
                .toList();
    }
}
