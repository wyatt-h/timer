import { notFound } from "next/navigation";
import { LessonPage } from "@/components/guide/lesson-page";
import { lessons } from "@/lib/guide";

export function generateStaticParams() { return lessons.map(lesson => ({ lesson: lesson.id })); }

export async function generateMetadata({ params }: { params: Promise<{ lesson: string }> }) {
  const { lesson: id } = await params;
  const lesson = lessons.find(item => item.id === id);
  return { title: lesson?.title ?? "Lesson not found", description: lesson?.description };
}

export default async function Page({ params }: { params: Promise<{ lesson: string }> }) {
  const { lesson: id } = await params;
  const lesson = lessons.find(item => item.id === id);
  if (!lesson) notFound();
  return <LessonPage key={lesson.id} lessonId={lesson.id} />;
}
