package com.manageedocs.common.dto;

import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

/** {@code {content, page, size, totalElements, totalPages}} — page is zero-based. */
public record PagedResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

    public static <E, T> PagedResponse<T> of(Page<E> page, Function<E, T> mapper) {
        return new PagedResponse<>(page.getContent().stream().map(mapper).toList(), page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages());
    }

    public static <T> PagedResponse<T> of(List<T> content, int page, int size, long totalElements) {
        int totalPages = size == 0 ? 0 : (int) Math.ceil((double) totalElements / size);
        return new PagedResponse<>(content, page, size, totalElements, totalPages);
    }
}
