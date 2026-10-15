import { useParams } from "react-router-dom";
import { KnowledgeBasePanel } from "../components/KnowledgeBasePanel";
import { PageHeader } from "../components/ui";

/** RAG/knowledge base is a first-class product capability, not a settings sub-item. */
export function KnowledgePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;

  return (
    <div className="page page-wide page-knowledge">
      <PageHeader
        eyebrow="AI knowledge"
        title="Knowledge base"
        description={'Documents uploaded here ground AI replies across every journey that has "Use knowledge base for context" enabled.'}
      />
      <div className="banner small knowledge-grounding-note" role="note">
        <strong>How grounding works:</strong> sources marked Ready are available to AI replies. Processing sources are still being prepared; failed sources are not used until they are replaced or uploaded again.
      </div>
      <KnowledgeBasePanel tenantId={tenantId} />
    </div>
  );
}
