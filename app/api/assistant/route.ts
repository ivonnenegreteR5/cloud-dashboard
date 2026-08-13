import { NextRequest, NextResponse } from "next/server";

const ASSISTANT_API_URL =
  process.env.ASSISTANT_API_URL || "http://127.0.0.1:8000";


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const question =
      typeof body?.question === "string"
        ? body.question.trim()
        : "";

    if (!question) {
      return NextResponse.json(
        {
          status: "error",
          answer: "La pregunta no puede estar vacía.",
        },
        {
          status: 400,
        }
      );
    }

    const response = await fetch(
      `${ASSISTANT_API_URL}/api/v1/chat/ask`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
        }),
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "[IDLinens Assistant] Backend error:",
        data
      );

      return NextResponse.json(
        {
          status: "error",
          answer:
            "No fue posible obtener una respuesta del asistente.",
        },
        {
          status: response.status,
        }
      );
    }

    return NextResponse.json({
      status: data.status,
      answer: data.answer,
      request_id: data.request_id,
      latency_ms: data.latency_ms,
    });
  } catch (error) {
    console.error(
      "[IDLinens Assistant] Route error:",
      error
    );

    return NextResponse.json(
      {
        status: "error",
        answer:
          "El asistente no está disponible en este momento.",
      },
      {
        status: 500,
      }
    );
  }
}