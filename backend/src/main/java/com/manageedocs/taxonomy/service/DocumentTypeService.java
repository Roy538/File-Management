package com.manageedocs.taxonomy.service;

import com.manageedocs.audit.service.AuditService;
import com.manageedocs.exception.ApiException;
import com.manageedocs.security.AppUserDetails;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.CreateDocumentTypeRequest;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.DocumentTypeView;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.MetadataFieldSpec;
import com.manageedocs.taxonomy.dto.TaxonomyDtos.MetadataFieldView;
import com.manageedocs.taxonomy.model.DocumentType;
import com.manageedocs.taxonomy.model.MetadataField;
import com.manageedocs.taxonomy.repository.DocumentTypeRepository;
import com.manageedocs.taxonomy.repository.MetadataFieldRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/** Document types and their metadata schemas (e.g. "Offer Letter": employee_no, start_date). */
@Service
public class DocumentTypeService {

    private final DocumentTypeRepository types;
    private final MetadataFieldRepository fields;
    private final AuditService audit;

    public DocumentTypeService(DocumentTypeRepository types, MetadataFieldRepository fields, AuditService audit) {
        this.types = types;
        this.fields = fields;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public List<DocumentTypeView> list() {
        List<DocumentType> all = types.findByActiveTrueOrderByNameAsc();
        Map<UUID, List<MetadataFieldView>> byType = fields
                .findByDocumentTypeIdInOrderBySortOrderAsc(all.isEmpty() ? List.of(new UUID(0, 0)) : all.stream().map(DocumentType::getId).toList())
                .stream().collect(Collectors.groupingBy(MetadataField::getDocumentTypeId,
                        Collectors.mapping(MetadataFieldView::of, Collectors.toList())));
        return all.stream().map(t -> new DocumentTypeView(t.getId(), t.getName(), t.getDescription(),
                byType.getOrDefault(t.getId(), List.of()), t.getRetentionPolicyId())).toList();
    }

    @Transactional
    public DocumentTypeView create(AppUserDetails caller, CreateDocumentTypeRequest req) {
        if (types.existsByNameIgnoreCase(req.name().trim())) {
            throw ApiException.conflict("DOCUMENT_TYPE_EXISTS", "A document type with this name already exists");
        }
        DocumentType type = types.save(new DocumentType(req.name(), req.description()));
        List<MetadataFieldSpec> specs = req.fields() == null ? List.of() : req.fields();
        Set<String> keys = new HashSet<>();
        int order = 0;
        for (MetadataFieldSpec spec : specs) {
            if (!keys.add(spec.key())) throw new IllegalArgumentException("Duplicate field key: " + spec.key());
            fields.save(new MetadataField(type.getId(), spec.key(), spec.label(), spec.dataType(), spec.required(),
                    spec.allowedValues(), order++));
        }
        audit.success(caller, "DOCUMENT_TYPE_CREATED", "DOCUMENT_TYPE", type.getId(),
                Map.of("name", type.getName(), "fields", Integer.toString(specs.size())));
        return view(type);
    }

    @Transactional
    public void deactivate(AppUserDetails caller, UUID id) {
        DocumentType type = types.findById(id).orElseThrow(() -> ApiException.notFound("Document type"));
        type.deactivate();
        audit.success(caller, "DOCUMENT_TYPE_DEACTIVATED", "DOCUMENT_TYPE", id, Map.of("name", type.getName()));
    }

    private DocumentTypeView view(DocumentType t) {
        return new DocumentTypeView(t.getId(), t.getName(), t.getDescription(),
                fields.findByDocumentTypeIdOrderBySortOrderAsc(t.getId()).stream().map(MetadataFieldView::of).toList(),
                t.getRetentionPolicyId());
    }
}
