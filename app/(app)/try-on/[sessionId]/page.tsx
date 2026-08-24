import { ResultsGallery } from "@/components/try-on/ResultsGallery";

export default async function TryOnResultsPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tes photos</h1>
        <p className="text-muted-foreground">3 angles générés à partir de ta photo de référence.</p>
      </div>
      <ResultsGallery sessionId={sessionId} />
    </div>
  );
}
