package com.manageedocs.search.service;

import com.manageedocs.common.dto.PagedResponse;
import com.manageedocs.common.persistence.UuidBytes;
import com.manageedocs.documents.model.Document;
import com.manageedocs.permissions.model.AclEntry;
import com.manageedocs.permissions.service.AccessPolicy;
import com.manageedocs.search.dto.SearchDtos.FacetValue;
import com.manageedocs.search.dto.SearchDtos.SearchHit;
import com.manageedocs.search.dto.SearchDtos.SearchQuery;
import com.manageedocs.search.dto.SearchDtos.SearchResult;
import com.manageedocs.search.dto.SearchDtos.Snippet;
import com.manageedocs.search.model.DocumentText;
import com.manageedocs.search.repository.DocumentTextRepository;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.taxonomy.model.Cabinet;
import com.manageedocs.taxonomy.model.DocumentType;
import com.manageedocs.taxonomy.model.Folder;
import com.manageedocs.taxonomy.repository.CabinetRepository;
import com.manageedocs.taxonomy.repository.DocumentTypeRepository;
import com.manageedocs.taxonomy.repository.FolderRepository;
import com.manageedocs.tenancy.TenantContext;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.manageedocs.permissions.model.ResourceRight.VIEW;

/**
 * Full-text + metadata search over the current version of every document (MySQL InnoDB FULLTEXT,
 * ADR-008). <b>Permission filtering happens inside the SQL</b>, never after it, so result counts,
 * facets, pagination and snippets can only ever reflect documents the caller may see.
 *
 * <p>Because grants only ever add rights, the visible set is exactly: documents in cabinets the caller
 * can view ∪ documents in the subtree of any folder granted to them ∪ documents granted directly.
 * Admins see their whole organisation. The tenant predicate is explicit because plain JDBC bypasses
 * Hibernate's {@code @TenantId} filter.
 */
@Service
public class SearchService {

    private static final int MIN_TOKEN = 3;   // InnoDB innodb_ft_min_token_size default

    private final NamedParameterJdbcTemplate jdbc;
    private final AccessPolicy policy;
    private final CabinetRepository cabinets;
    private final FolderRepository folders;
    private final DocumentTypeRepository types;
    private final DocumentTextRepository texts;

    public SearchService(NamedParameterJdbcTemplate jdbc, AccessPolicy policy, CabinetRepository cabinets,
                         FolderRepository folders, DocumentTypeRepository types, DocumentTextRepository texts) {
        this.jdbc = jdbc;
        this.policy = policy;
        this.cabinets = cabinets;
        this.folders = folders;
        this.types = types;
        this.texts = texts;
    }

    @Transactional(readOnly = true)
    public SearchResult search(AppUserDetails caller, SearchQuery query) {
        int page = Math.max(query.page(), 0);
        int size = Math.min(Math.max(query.size(), 1), 100);
        List<String> tokens = tokens(query.q());
        MapSqlParameterSource p = new MapSqlParameterSource();
        StringBuilder where = new StringBuilder("""
                 from document d
                 join document_version v on v.document_id = d.id and v.version_no = d.current_version_no
                 left join document_text t on t.document_version_id = v.id
                 where d.tenant_id = :tenant and d.deleted_at is null
                """);
        p.addValue("tenant", UuidBytes.of(TenantContext.require()));

        boolean fullText = tokens.stream().anyMatch(t -> t.length() >= MIN_TOKEN);
        if (!tokens.isEmpty()) {
            String like = "%" + String.join(" ", tokens) + "%";
            p.addValue("like", like);
            if (fullText) {
                p.addValue("bq", tokens.stream().filter(t -> t.length() >= MIN_TOKEN).map(t -> "+" + t + "*")
                        .collect(Collectors.joining(" ")));
                where.append(" and (match(d.title) against (:bq in boolean mode)"
                        + " or match(t.content) against (:bq in boolean mode) or lower(d.title) like :like)");
            } else {
                where.append(" and lower(d.title) like :like");
            }
        }
        if (!appendAccess(caller, where, p)) {
            return new SearchResult(PagedResponse.of(List.of(), page, size, 0), Map.of());
        }
        appendFilters(query, where, p);

        Long total = jdbc.queryForObject("select count(*)" + where, p, Long.class);
        String score = fullText
                ? "(ifnull(match(d.title) against (:nq), 0) * 3 + ifnull(match(t.content) against (:nq), 0))"
                : "0";
        if (fullText) p.addValue("nq", String.join(" ", tokens));
        p.addValue("limit", size).addValue("offset", page * size);
        List<Row> rows = jdbc.query("""
                select d.id, d.title, d.status, d.cabinet_id, d.folder_id, d.document_type_id, d.current_version_no,
                       d.updated_at, v.id as version_id, v.original_filename, v.content_type,
                       %s as score, (t.document_version_id is not null and %s) as content_hit
                """.formatted(score, fullText ? "match(t.content) against (:bq in boolean mode)" : "false")
                        + where + " order by score desc, d.updated_at desc limit :limit offset :offset", p,
                (rs, i) -> new Row(UuidBytes.from(rs.getBytes("id")), rs.getString("title"),
                        Document.Status.valueOf(rs.getString("status")), UuidBytes.from(rs.getBytes("cabinet_id")),
                        UuidBytes.from(rs.getBytes("folder_id")), uuidOrNull(rs.getBytes("document_type_id")),
                        rs.getInt("current_version_no"), rs.getTimestamp("updated_at").toInstant(),
                        UuidBytes.from(rs.getBytes("version_id")), rs.getString("original_filename"),
                        rs.getString("content_type"), rs.getDouble("score"), rs.getBoolean("content_hit")));

        Map<UUID, String> cabinetNames = cabinets.findAll().stream().collect(Collectors.toMap(Cabinet::getId, Cabinet::getName));
        Map<UUID, String> folderNames = rows.isEmpty() ? Map.of() : folders.findAllById(rows.stream().map(Row::folderId).toList())
                .stream().collect(Collectors.toMap(Folder::getId, Folder::getName));
        Map<UUID, DocumentText> textByVersion = rows.isEmpty() ? Map.of() : texts
                .findByDocumentVersionIdIn(rows.stream().filter(Row::contentHit).map(Row::versionId).toList())
                .stream().collect(Collectors.toMap(DocumentText::getDocumentVersionId, Function.identity()));

        List<SearchHit> hits = rows.stream().map(r -> new SearchHit(r.id(), r.title(), r.status(), r.cabinetId(),
                cabinetNames.get(r.cabinetId()), r.folderId(), folderNames.get(r.folderId()), r.documentTypeId(),
                r.versionNo(), r.fileName(), r.contentType(), r.updatedAt(), r.score(), r.contentHit(),
                r.contentHit() && textByVersion.containsKey(r.versionId())
                        ? snippet(textByVersion.get(r.versionId()).getContent(), tokens) : null)).toList();

        return new SearchResult(PagedResponse.of(hits, page, size, total == null ? 0 : total),
                facets(where.toString(), p, cabinetNames));
    }

    private record Row(UUID id, String title, Document.Status status, UUID cabinetId, UUID folderId, UUID documentTypeId,
                       int versionNo, java.time.Instant updatedAt, UUID versionId, String fileName, String contentType,
                       double score, boolean contentHit) {
    }

    /**
     * Adds the visibility predicate. Returns false when the caller can see nothing at all.
     */
    private boolean appendAccess(AppUserDetails caller, StringBuilder where, MapSqlParameterSource p) {
        if (caller.isAdmin()) return true;
        AccessPolicy.Evaluator eval = policy.evaluator(caller);
        List<byte[]> visibleCabinets = cabinets.findAll().stream()
                .filter(c -> VIEW.in(eval.rights(c, List.of(), null)))
                .map(c -> UuidBytes.of(c.getId())).toList();
        Set<UUID> folderIds = new HashSet<>();
        for (UUID granted : policy.grantedResourceIds(caller, AclEntry.ResourceType.FOLDER)) {
            folders.findById(granted).ifPresent(f -> folders.findSubtree(f.getPath()).forEach(s -> folderIds.add(s.getId())));
        }
        Set<UUID> docIds = policy.grantedResourceIds(caller, AclEntry.ResourceType.DOCUMENT);
        List<String> clauses = new ArrayList<>();
        if (!visibleCabinets.isEmpty()) {
            clauses.add("d.cabinet_id in (:visCabinets)");
            p.addValue("visCabinets", visibleCabinets);
        }
        if (!folderIds.isEmpty()) {
            clauses.add("d.folder_id in (:visFolders)");
            p.addValue("visFolders", folderIds.stream().map(UuidBytes::of).toList());
        }
        if (!docIds.isEmpty()) {
            clauses.add("d.id in (:visDocs)");
            p.addValue("visDocs", docIds.stream().map(UuidBytes::of).toList());
        }
        if (clauses.isEmpty()) return false;
        where.append(" and (").append(String.join(" or ", clauses)).append(")");
        return true;
    }

    private void appendFilters(SearchQuery q, StringBuilder where, MapSqlParameterSource p) {
        if (q.cabinetId() != null) {
            where.append(" and d.cabinet_id = :fCabinet");
            p.addValue("fCabinet", UuidBytes.of(q.cabinetId()));
        }
        if (q.folderId() != null) {
            List<byte[]> subtree = folders.findById(q.folderId())
                    .map(f -> folders.findSubtree(f.getPath()).stream().map(s -> UuidBytes.of(s.getId())).toList())
                    .orElse(List.of());
            if (subtree.isEmpty()) {
                where.append(" and 1 = 0");
            } else {
                where.append(" and d.folder_id in (:fFolders)");
                p.addValue("fFolders", subtree);
            }
        }
        if (q.documentTypeId() != null) {
            where.append(" and d.document_type_id = :fType");
            p.addValue("fType", UuidBytes.of(q.documentTypeId()));
        }
        if (q.status() != null) {
            where.append(" and d.status = :fStatus");
            p.addValue("fStatus", q.status().name());
        }
        if (q.ownerId() != null) {
            where.append(" and d.owner_id = :fOwner");
            p.addValue("fOwner", UuidBytes.of(q.ownerId()));
        }
        if (q.updatedFrom() != null) {
            where.append(" and d.updated_at >= :fFrom");
            p.addValue("fFrom", Timestamp.from(q.updatedFrom().atStartOfDay().toInstant(ZoneOffset.UTC)));
        }
        if (q.updatedTo() != null) {
            where.append(" and d.updated_at < :fTo");
            p.addValue("fTo", Timestamp.from(q.updatedTo().plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)));
        }
    }

    private Map<String, List<FacetValue>> facets(String where, MapSqlParameterSource p, Map<UUID, String> cabinetNames) {
        Map<UUID, String> typeNames = types.findAll().stream().collect(Collectors.toMap(DocumentType::getId, DocumentType::getName));
        Map<String, List<FacetValue>> out = new LinkedHashMap<>();
        out.put("cabinet", jdbc.query("select d.cabinet_id as k, count(*) as n" + where + " group by d.cabinet_id order by n desc",
                p, (rs, i) -> {
                    UUID id = UuidBytes.from(rs.getBytes("k"));
                    return new FacetValue(id.toString(), cabinetNames.get(id), rs.getLong("n"));
                }));
        out.put("documentType", jdbc.query("select d.document_type_id as k, count(*) as n" + where
                + " group by d.document_type_id order by n desc", p, (rs, i) -> {
            UUID id = uuidOrNull(rs.getBytes("k"));
            return new FacetValue(id == null ? null : id.toString(), id == null ? "Unclassified" : typeNames.get(id), rs.getLong("n"));
        }));
        out.put("status", jdbc.query("select d.status as k, count(*) as n" + where + " group by d.status order by n desc",
                p, (rs, i) -> new FacetValue(rs.getString("k"), rs.getString("k"), rs.getLong("n"))));
        return out;
    }

    /** Lower-cased word tokens; everything else (including boolean-mode operators) is discarded. */
    static List<String> tokens(String q) {
        if (q == null || q.isBlank()) return List.of();
        return Arrays.stream(q.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+"))
                .filter(t -> !t.isBlank()).limit(12).toList();
    }

    /** ~200-character window around the first match, with every token occurrence marked. */
    static Snippet snippet(String content, List<String> tokens) {
        if (content == null || content.isEmpty() || tokens.isEmpty()) return null;
        String lower = content.toLowerCase(Locale.ROOT);
        int first = -1;
        for (String t : tokens) {
            int i = lower.indexOf(t);
            if (i >= 0 && (first < 0 || i < first)) first = i;
        }
        if (first < 0) return null;
        int start = Math.max(0, first - 60);
        int end = Math.min(content.length(), first + 140);
        String window = content.substring(start, end).replace('\n', ' ');
        String lw = window.toLowerCase(Locale.ROOT);
        List<int[]> marks = new ArrayList<>();
        for (String t : tokens) {
            int i = lw.indexOf(t);
            while (i >= 0) {
                marks.add(new int[]{i, i + t.length()});
                i = lw.indexOf(t, i + t.length());
            }
        }
        marks.sort((a, b) -> Integer.compare(a[0], b[0]));
        String prefix = start > 0 ? "…" : "";
        if (!prefix.isEmpty()) marks.replaceAll(m -> new int[]{m[0] + 1, m[1] + 1});
        return new Snippet(prefix + window + (end < content.length() ? "…" : ""), marks);
    }

    private static UUID uuidOrNull(byte[] b) {
        return b == null ? null : UuidBytes.from(b);
    }
}
