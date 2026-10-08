import { DocumentCard } from "@/components/documents/DocumentCard";
import { DocumentUploadSlots } from "@/components/documents/DocumentUploadSlots";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ListRowSkeleton } from "@/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useToast } from "@/store/hooks";
import { useProfile } from "@/context/ProfileContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as documentApi from "@/services/api/documentApi";
import type { DocumentType, ExtractedDocumentData, UploadedDocument } from "@/types";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function DocumentsPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { data, loading, error, reload, setData } = useAsyncData(() => documentApi.listDocuments());
  const profile = useProfile();
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedDocumentData | null>(null);

  if (error) return <ErrorState onRetry={() => void reload()} onDashboard={() => navigate("/dashboard")} />;

  async function handleUpload(type: DocumentType, files: File[], label?: string) {
    setUploadingType(type);
    try {
      for (const file of files) {
        const created = await documentApi.uploadDocument(file, type, {
          label,
          status: profile.data?.status,
          educationLevel: profile.data?.educationLevel,
        });
        setData((prev) => [created, ...(prev ?? []).filter((d) => d.id !== created.id)]);
        const done = await documentApi.waitForDocument(created.id);
        setData((prev) => (prev ?? []).map((d) => (d.id === done.id ? done : d)));
        if (done.status === "failed") {
          push(`${file.name} saved but extraction failed. Try a clearer photo or a smaller PDF.`);
          continue;
        }
        try {
          setExtracted(await documentApi.getExtractedData(done.id));
        } catch {
          /* extraction row may still be writing */
        }
      }
      setData(await documentApi.listDocuments());
      push("Document uploaded");
    } catch (err) {
      push(err instanceof Error ? err.message : "Upload failed");
      throw err;
    } finally {
      setUploadingType(null);
    }
  }

  async function handleDelete(id: string) {
    try {
      await documentApi.deleteDocument(id);
      setData((prev) => (prev ?? []).filter((d) => d.id !== id));
      setExtracted((prev) => (prev?.documentId === id ? null : prev));
      push("Document removed");
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not delete document");
      throw err;
    }
  }

  async function handleReplace(doc: UploadedDocument, file: File, label?: string) {
    setReplacingId(doc.id);
    try {
      const updated = await documentApi.replaceDocument(doc.id, file, doc.type, {
        label,
        status: profile.data?.status,
        educationLevel: profile.data?.educationLevel,
      });
      setData((prev) => (prev ?? []).map((d) => (d.id === updated.id ? updated : d)));
      const done = await documentApi.waitForDocument(updated.id);
      setData((prev) => (prev ?? []).map((d) => (d.id === done.id ? done : d)));
      if (done.status === "failed") {
        push(`${file.name} saved but extraction failed. Try a clearer photo or a smaller PDF.`);
        return;
      }
      setData(await documentApi.listDocuments());
      try {
        setExtracted(await documentApi.getExtractedData(done.id));
      } catch {
        /* extraction may still be writing */
      }
      push("Document updated");
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not replace document");
      throw err;
    } finally {
      setReplacingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Document center</h1>
        <p className="text-sm text-slate-500">
          {profile.data?.careerTrack === "government_exam"
            ? "Sarkari ladder: Class 10 for age, then 12th, then graduation if that exam asks. Board % is not a score."
            : "Upload 10th, 12th, and semester marksheets one by one (all optional). Add more than one degree by name. Required slots follow whether you are still studying or already graduated."}
        </p>
      </div>

      {profile.data && (
        <DocumentUploadSlots
          status={profile.data.status}
          educationLevel={profile.data.educationLevel}
          careerTrack={profile.data.careerTrack}
          documents={data ?? []}
          uploadingType={uploadingType}
          replacingId={replacingId}
          onUpload={(type, files, label) => handleUpload(type, files, label)}
          onDelete={(id) => handleDelete(id)}
          onReplace={(doc, file, label) => handleReplace(doc, file, label)}
        />
      )}

      {loading && !data && <ListRowSkeleton count={3} />}
      {!loading && data?.length === 0 && (
        <EmptyState title="No documents" description="Use the slots above. Nothing is globally forced — only what your profile needs." />
      )}
      <div className="space-y-3">
        {data?.map((doc) => (
          <DocumentCard
            key={`${doc.id}-${doc.uploadedAt}`}
            doc={doc}
            busy={replacingId === doc.id}
            onSelect={(id) => void documentApi.getExtractedData(id).then(setExtracted)}
            onDelete={(id) => void handleDelete(id)}
            onReplace={(item, file) => void handleReplace(item, file)}
          />
        ))}
      </div>

      {extracted && (
        <Card>
          <CardHeader
            title="Information extracted from your document"
            action={<Badge tone="info">AI extracted</Badge>}
          />
          <CardBody className="space-y-3 text-sm">
            {extracted.degree && (
              <p>
                <span className="font-medium">Degree: </span>
                {extracted.degree}
              </p>
            )}
            {extracted.subjects && (
              <div>
                <p className="font-medium">Subjects / marks</p>
                <ul className="mt-1 list-disc pl-5">
                  {extracted.subjects.map((s) => (
                    <li key={s.name}>
                      {s.name}: {s.marks}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {extracted.skillsDetected && (
              <p>
                <span className="font-medium">Skills detected: </span>
                {extracted.skillsDetected.join(", ")}
              </p>
            )}
            <p className="text-slate-500">{extracted.summary}</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/profile")}>
              Confirm on profile
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
