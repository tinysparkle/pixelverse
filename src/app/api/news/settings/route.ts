import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNewsPushEnabled, setNewsPushEnabled } from "@/lib/db/queries";

export async function GET() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "未登录" }, { status: 401 });
	}

	const pushEnabled = await getNewsPushEnabled();
	return NextResponse.json({ pushEnabled });
}

export async function PATCH(req: Request) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "未登录" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const pushEnabled = (body as { pushEnabled?: unknown }).pushEnabled;
	if (typeof pushEnabled !== "boolean") {
		return NextResponse.json({ error: "需要 pushEnabled: boolean" }, { status: 400 });
	}

	await setNewsPushEnabled(pushEnabled);
	return NextResponse.json({ pushEnabled });
}
