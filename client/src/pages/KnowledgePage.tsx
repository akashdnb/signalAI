import { useParams } from "react-router-dom";
import { KnowledgeBasePanel } from "../components/KnowledgeBasePanel";
import { PageHeader } from "../components/ui";
import "../styles/knowledge-settings-parity.css";

/** RAG/knowledge base is a first-class product capability, not a settings sub-item. */
export function KnowledgePage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  if (!tenantId) return null;

  return (
    <div className="page page-wide page-knowledge">
      <PageHeader
        eyebrow="AI knowledge"
        title="Knowledge base"
        description="Review sources that ground AI replies, inspect processing health, and test retrieval."
      />
      <div className="banner small knowledge-grounding-note" role="note">
        <strong>Grounding status:</strong> Ready sources can ground AI replies. Processing sources are still being prepared; failed sources are excluded until replaced or uploaded again.
      </div>
      <KnowledgeBasePanel tenantId={tenantId} />
    </div>
  );
}
