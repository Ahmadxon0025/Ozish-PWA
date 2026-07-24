import { createServerSupabase } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { phone } = await req.json();

    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { message: "Telefon raqami kiritilmadi." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    // Look up user by phone number (search in phone field)
    const { data, error } = await supabase
      .from("users")
      .select("id, email")
      .eq("phone", phone.trim())
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { message: "Telefon raqami topilmadi." },
        { status: 404 }
      );
    }

    if (!data.email) {
      return NextResponse.json(
        { message: "Emaili konfiguratsiya qilinmagan." },
        { status: 500 }
      );
    }

    return NextResponse.json({ email: data.email });
  } catch (err) {
    console.error("Phone lookup error:", err);
    return NextResponse.json(
      { message: "Serverda xatolik yuz berdi." },
      { status: 500 }
    );
  }
}
