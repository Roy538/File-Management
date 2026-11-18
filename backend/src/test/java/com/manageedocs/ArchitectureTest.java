package com.manageedocs;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import jakarta.persistence.Entity;
import org.springframework.data.repository.Repository;
import org.springframework.web.bind.annotation.RestController;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.methods;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/** Guards the layering rules from CLAUDE.md §1 so they cannot silently erode. */
@AnalyzeClasses(packages = "com.manageedocs", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    @ArchTest
    static final ArchRule controllersDoNotUseRepositories = noClasses()
            .that().areAnnotatedWith(RestController.class)
            .should().dependOnClassesThat().areAssignableTo(Repository.class)
            .because("controllers go through application services");

    @ArchTest
    static final ArchRule controllersDoNotReturnEntities = methods()
            .that().areDeclaredInClassesThat().areAnnotatedWith(RestController.class)
            .and().arePublic()
            .should().notHaveRawReturnType(com.tngtech.archunit.base.DescribedPredicate.describe(
                    "a JPA entity", (com.tngtech.archunit.core.domain.JavaClass c) -> c.isAnnotatedWith(Entity.class)))
            .because("API contracts are DTOs, never JPA entities");

    @ArchTest
    static final ArchRule domainDoesNotDependOnWeb = noClasses()
            .that().resideInAPackage("..domain..")
            .should().dependOnClassesThat().resideInAnyPackage("..api..", "org.springframework.web..")
            .because("the domain must not know about HTTP");
}
