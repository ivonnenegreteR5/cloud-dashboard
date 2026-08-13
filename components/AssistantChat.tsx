"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";


type Message = {
  role: "user" | "assistant";
  content: string;
};


const INITIAL_MESSAGES: Message[] = [
  {
    role: "assistant",
    content:
      "Hola 👋 Soy el asistente de IDLinens. Puedo ayudarte con dudas sobre el Dashboard y la aplicación Android.",
  },
];


export default function AssistantChat() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] =
    useState<Message[]>(INITIAL_MESSAGES);

  const bottomRef =
    useRef<HTMLDivElement | null>(null);


  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);


  function closeChat() {
    setOpen(false);
    setQuestion("");
    setLoading(false);
    setMessages(INITIAL_MESSAGES);
  }


  function toggleChat() {
    if (open) {
      closeChat();
      return;
    }

    setOpen(true);
  }


  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanQuestion =
      question.trim();

    if (
      !cleanQuestion ||
      loading
    ) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        role: "user",
        content: cleanQuestion,
      },
    ]);

    setQuestion("");
    setLoading(true);

    try {
      const response = await fetch(
        "/api/assistant",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            question: cleanQuestion,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.answer ||
            data?.detail ||
            "No fue posible obtener una respuesta."
        );
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            data.answer ||
            "No encontré una respuesta para esa consulta.",
        },
      ]);
    } catch (error) {
      console.error(
        "[AssistantChat] Error:",
        error
      );

      let errorMessage =
        "El asistente no está disponible en este momento. Intenta nuevamente en unos segundos.";

      if (
        error instanceof Error &&
        error.message
      ) {
        errorMessage =
          error.message;
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: errorMessage,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }


  return (
    <>
      {open && (
        <div
          style={{
            position: "fixed",
            right: 24,
            bottom: 100,
            width: 380,
            maxWidth:
              "calc(100vw - 32px)",
            height: 520,
            maxHeight: "70vh",
            background: "#ffffff",
            border:
              "1px solid #e5e7eb",
            borderRadius: 18,
            boxShadow:
              "0 20px 45px rgba(0, 0, 0, 0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 9999,
          }}
        >
          {/* Encabezado */}
          <div
            style={{
              padding: "16px 18px",
              borderBottom:
                "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent:
                "space-between",
              background: open ? "#111827" : "#ffffff",
              color: "#ffffff",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
  style={{
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  }}
>
  <img
    src="/idlinens-assistant.png"
    alt="Asistente IDLinens"
    style={{
      width: "100%",
      height: "100%",
      objectFit: "cover",
    }}
  />
</div>

              <div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  Asistente IDLinens
                </div>

                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.8,
                    marginTop: 2,
                  }}
                >
                  Dashboard y aplicación
                  Android
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={closeChat}
              aria-label="Cerrar asistente"
              style={{
                border: "none",
                background:
                  "transparent",
                color: "#ffffff",
                cursor: "pointer",
                fontSize: 24,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>


          {/* Mensajes */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
              background: "#f9fafb",
            }}
          >
            {messages.map(
              (message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  style={{
                    display: "flex",
                    justifyContent:
                      message.role === "user"
                        ? "flex-end"
                        : "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      whiteSpace:
                        "pre-wrap",
                      lineHeight: 1.5,
                      fontSize: 14,
                      padding:
                        "10px 12px",
                      borderRadius:
                        message.role ===
                        "user"
                          ? "14px 14px 4px 14px"
                          : "14px 14px 14px 4px",
                      background:
                        message.role ===
                        "user"
                          ? "#111827"
                          : "#ffffff",
                      color:
                        message.role ===
                        "user"
                          ? "#ffffff"
                          : "#111827",
                      border:
                        message.role ===
                        "assistant"
                          ? "1px solid #e5e7eb"
                          : "none",
                      boxShadow:
                        message.role ===
                        "assistant"
                          ? "0 2px 8px rgba(0,0,0,0.05)"
                          : "none",
                    }}
                  >
                    {message.content}
                  </div>
                </div>
              )
            )}


            {loading && (
              <div
                style={{
                  display: "flex",
                  justifyContent:
                    "flex-start",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    padding:
                      "10px 12px",
                    borderRadius:
                      "14px 14px 14px 4px",
                    background:
                      "#ffffff",
                    border:
                      "1px solid #e5e7eb",
                    color: "#6b7280",
                    fontSize: 14,
                    display: "flex",
                    alignItems:
                      "center",
                    gap: 8,
                  }}
                >
                  <span>🤖</span>
                  <span>
                    Pensando...
                  </span>
                </div>
              </div>
            )}


            <div ref={bottomRef} />
          </div>


          {/* Campo de texto */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: 12,
              borderTop:
                "1px solid #e5e7eb",
              display: "flex",
              gap: 8,
              background: "#ffffff",
            }}
          >
            <input
              value={question}
              onChange={(event) =>
                setQuestion(
                  event.target.value
                )
              }
              placeholder="Escribe tu pregunta..."
              disabled={loading}
              style={{
                flex: 1,
                border:
                  "1px solid #d1d5db",
                borderRadius: 10,
                padding:
                  "10px 12px",
                outline: "none",
                fontSize: 14,
              }}
            />

            <button
              type="submit"
              disabled={
                loading ||
                !question.trim()
              }
              style={{
                border: "none",
                borderRadius: 10,
                padding: "0 16px",
                cursor:
                  loading ||
                  !question.trim()
                    ? "not-allowed"
                    : "pointer",
                background:
                  loading ||
                  !question.trim()
                    ? "#9ca3af"
                    : "#111827",
                color: "#ffffff",
                fontWeight: 600,
              }}
            >
              Enviar
            </button>
          </form>
        </div>
      )}

{/* Burbujita de ayuda */}
{!open && (
  <div
    style={{
      position: "fixed",

      // La coloca ARRIBA del robot
      bottom: 175,

      // La coloca hacia el lado DERECHO
      right: 18,

      background: "#ffffff",
      color: "#111827",
      border: "1px solid #e5e7eb",
      borderRadius: 14,
      padding: "10px 14px",
      fontSize: 13,
      fontWeight: 600,
      boxShadow:
        "0 8px 20px rgba(0,0,0,0.12)",
      zIndex: 9998,
      whiteSpace: "nowrap",
    }}
  >
    ¿Necesitas ayuda? Consúltame

    {/* Pico de la burbuja */}
    <div
      style={{
        position: "absolute",
        right: 42,
        bottom: -8,
        width: 16,
        height: 16,
        background: "#ffffff",
        borderRight: "1px solid #e5e7eb",
        borderBottom: "1px solid #e5e7eb",
        transform: "rotate(45deg)",
      }}
    />
  </div>
)}

      {/* Botón flotante */}
      <button
        type="button"
        onClick={toggleChat}
        aria-label={
          open
            ? "Cerrar asistente IDLinens"
            : "Abrir asistente IDLinens"
        }
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          width: 110,
          height: 125,
          
          cursor: "pointer",
          zIndex: 9999,
          fontSize: 27,
          display: "flex",
          alignItems: "center",
          justifyContent:
            "center",
          transition:
            "transform 0.2s ease",
        }}
      >
       {open ? (
  "×"
) : (
  <img
    src="/idlinens-assistant.png"
    alt="Asistente IDLinens"
    style={{
      width: 160,
      height: 160,
      objectFit: "cover",
      borderRadius: "50%",
    }}
  />
)}
      </button>
    </>
  );
}