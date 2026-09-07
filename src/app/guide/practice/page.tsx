import { PracticeEvent } from "@/components/guide/practice-event";

export const metadata = { title: "Practise with Timer", description: "Learn Timer with a local sample event. Try the real controls without changing a live event." };

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <PracticeEvent mode={mode} />;
}
