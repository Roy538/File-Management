package com.manageedocs.search.dto;

import com.manageedocs.common.dto.PagedResponse;
import com.manageedocs.documents.model.Document;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class SearchDtos {

    private SearchDtos() {
    }

    /** All filters optional; {@code folderId} includes the folder's whole subtree. */
    public record SearchQuery(String q, UUID cabinetId, UUID folderId, UUID documentTypeId, Document.Status status,
                              UUID ownerId, LocalDate updatedFrom, LocalDate updatedTo, int page, int size) {
    }

    /**
     * A text excerpt plus [start, end) character ranges to emphasise. Offsets rather than HTML so the
     * client renders matches safely (document text is never injected as markup).
     */
    public record Snippet(String text, List<int[]> highlights) {
    }

    public record SearchHit(UUID id, String title, Document.Status status, UUID cabinetId, String cabinetName,
                            UUID folderId, String folderName, UUID documentTypeId, int versionNo, String fileName,
                            String contentType, Instant updatedAt, double score, boolean matchedContent, Snippet snippet) {
    }

    public record FacetValue(String value, String label, long count) {
    }

    public record SearchResult(PagedResponse<SearchHit> results, Map<String, List<FacetValue>> facets) {
    }
}
