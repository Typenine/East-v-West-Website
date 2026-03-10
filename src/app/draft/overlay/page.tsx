import DraftOverlayLive from "@/components/draft-overlay/DraftOverlayLive";

export default function DraftOverlayPage() {
  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-black">
      <DraftOverlayLive />
    </div>
  );
}
