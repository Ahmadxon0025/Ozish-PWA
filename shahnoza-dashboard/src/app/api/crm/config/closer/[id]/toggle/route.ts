import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } },
) {
  // TODO(Day 6): toggle crm_users.is_active for closer params.id
  return NextResponse.json(
    { error: "Closer toggle — Day 6", id: params.id },
    { status: 501 },
  );
}
