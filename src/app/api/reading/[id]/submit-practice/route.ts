import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLatestReadingPracticeForItem, getReadingItemByIdForUser, getReadingPracticeByIdForUser, updateReadingPracticeResultForUser } from "@/lib/db/queries";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const item = await getReadingItemByIdForUser(id, session.user.id);
  if (!item) return NextResponse.json({ error: "阅读文章不存在" }, { status: 404 });

  const body = await req.json();
  const answers = Array.isArray(body.answers) ? body.answers : [];
  const practiceId = typeof body.practiceId === "string" ? body.practiceId : null;
  const targetPractice = practiceId
    ? await getReadingPracticeByIdForUser(practiceId, session.user.id)
    : await getLatestReadingPracticeForItem(id, session.user.id);

  const activePractice = targetPractice?.id;
  const questionPayload = targetPractice?.questionJson ? JSON.parse(targetPractice.questionJson) : null;
  const questions = Array.isArray(questionPayload?.questions) ? questionPayload.questions : [];

  if (!activePractice || questions.length === 0) {
    return NextResponse.json({ error: "没有可提交的练习" }, { status: 400 });
  }

  const graded = questions.map((question: { id: string; answer: string; explanation_cn: string; prompt: string }) => {
    const userAnswer = answers.find((answer: { id?: string }) => answer?.id === question.id)?.answer ?? "";
    const correct = String(userAnswer).trim() === String(question.answer).trim();
    return {
      id: question.id,
      prompt: question.prompt,
      userAnswer,
      correctAnswer: question.answer,
      correct,
      explanation: question.explanation_cn,
    };
  });

  const score = questions.length ? Math.round((graded.filter((item: { correct: boolean }) => item.correct).length / questions.length) * 100) : 0;

  const updated = await updateReadingPracticeResultForUser(activePractice, session.user.id, {
    resultJson: JSON.stringify({ answers: graded }),
    score,
  });

  return NextResponse.json({
    score,
    results: graded,
    practice: updated,
  });
}
