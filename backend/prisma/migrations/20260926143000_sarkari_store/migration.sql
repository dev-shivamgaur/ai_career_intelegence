-- CreateTable
CREATE TABLE "sarkari_web_snapshot" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'news',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sarkari_web_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sarkari_mock_attempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "subjectId" TEXT,
    "scorePercent" INTEGER NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "sarkari_mock_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sarkari_knowledge_chunk" (
    "id" TEXT NOT NULL,
    "examId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT,
    "sourceUrl" TEXT,
    "kind" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sarkari_knowledge_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sarkari_web_snapshot_examId_url_key" ON "sarkari_web_snapshot"("examId", "url");
CREATE INDEX "sarkari_web_snapshot_examId_idx" ON "sarkari_web_snapshot"("examId");
CREATE INDEX "sarkari_web_snapshot_site_idx" ON "sarkari_web_snapshot"("site");
CREATE INDEX "sarkari_mock_attempt_userId_examId_idx" ON "sarkari_mock_attempt"("userId", "examId");
CREATE INDEX "sarkari_mock_attempt_examId_idx" ON "sarkari_mock_attempt"("examId");
CREATE INDEX "sarkari_knowledge_chunk_examId_idx" ON "sarkari_knowledge_chunk"("examId");
CREATE INDEX "sarkari_knowledge_chunk_kind_idx" ON "sarkari_knowledge_chunk"("kind");

-- AddForeignKey
ALTER TABLE "sarkari_web_snapshot" ADD CONSTRAINT "sarkari_web_snapshot_examId_fkey" FOREIGN KEY ("examId") REFERENCES "government_exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sarkari_mock_attempt" ADD CONSTRAINT "sarkari_mock_attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sarkari_mock_attempt" ADD CONSTRAINT "sarkari_mock_attempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "government_exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sarkari_mock_attempt" ADD CONSTRAINT "sarkari_mock_attempt_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "government_exam_subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sarkari_knowledge_chunk" ADD CONSTRAINT "sarkari_knowledge_chunk_examId_fkey" FOREIGN KEY ("examId") REFERENCES "government_exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;
