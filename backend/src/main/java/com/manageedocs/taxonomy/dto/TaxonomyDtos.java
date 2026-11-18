package com.manageedocs.taxonomy.dto;

import com.manageedocs.permissions.model.ResourceRight;
import com.manageedocs.taxonomy.model.Cabinet;
import com.manageedocs.taxonomy.model.MetadataField;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/** API contracts for cabinets, folders, sub-dividers and document types. */
public final class TaxonomyDtos {

    private TaxonomyDtos() {
    }

    /** Effective rights as lower-case names ("view", "upload", …) so the UI can enable/disable actions. */
    public static List<String> rightNames(int mask) {
        return ResourceRight.fromMask(mask).stream().map(r -> r.name().toLowerCase()).toList();
    }

    public record CreateCabinetRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description,
            @NotNull Cabinet.Visibility visibility) {
    }

    public record UpdateCabinetRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description) {
    }

    public record CabinetView(UUID id, String name, String description, Cabinet.Visibility visibility,
                              UUID ownerId, List<String> rights, UUID retentionPolicyId) {
    }

    public record SubDividerView(UUID id, UUID folderId, String name) {
    }

    public record FolderNode(UUID id, UUID parentId, String name, int depth, List<SubDividerView> subDividers,
                             List<String> rights) {
    }

    public record CabinetTree(CabinetView cabinet, List<FolderNode> folders) {
    }

    public record CreateFolderRequest(
            @NotBlank @Size(max = 200) String name,
            UUID parentId) {
    }

    public record RenameRequest(@NotBlank @Size(max = 200) String name) {
    }

    /** Move to the root of {@code targetCabinetId}, or beneath {@code targetParentId} (which wins). */
    public record MoveFolderRequest(UUID targetCabinetId, UUID targetParentId) {
    }

    public record FolderView(UUID id, UUID cabinetId, UUID parentId, String name, int depth, List<String> rights) {
    }

    public record MetadataFieldSpec(
            @NotBlank @Pattern(regexp = "[a-z][a-z0-9_]{0,63}", message = "must be lower_snake_case") String key,
            @NotBlank @Size(max = 200) String label,
            @NotNull MetadataField.DataType dataType,
            boolean required,
            List<@NotBlank @Size(max = 200) String> allowedValues) {
    }

    public record CreateDocumentTypeRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 1000) String description,
            @Valid List<MetadataFieldSpec> fields) {
    }

    public record MetadataFieldView(UUID id, String key, String label, MetadataField.DataType dataType,
                                    boolean required, List<String> allowedValues) {
        public static MetadataFieldView of(MetadataField f) {
            return new MetadataFieldView(f.getId(), f.getKey(), f.getLabel(), f.getDataType(), f.isRequired(),
                    f.allowedValueList());
        }
    }

    public record DocumentTypeView(UUID id, String name, String description, List<MetadataFieldView> fields,
                                   UUID retentionPolicyId) {
    }
}
