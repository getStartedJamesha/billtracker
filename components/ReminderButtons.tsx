"use client";

import { useEffect, useState } from "react";
import { normalizePhoneDigits } from "@/lib/phone";

// sms: links need "&body=" on iOS but "?body=" everywhere else - there's no
// portable syntax, so this is detected client-side from the user's own
// device (whoever is tapping the button, not the server).
export default function ReminderButtons({ phone, message }: { phone: string; message: string }) {
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
  }, []);

  const digits = normalizePhoneDigits(phone);
  if (digits.length !== 10) return null;

  const encodedMessage = encodeURIComponent(message);
  const smsHref = `sms:${digits}${isIOS ? "&" : "?"}body=${encodedMessage}`;
  const whatsAppHref = `https://wa.me/1${digits}?text=${encodedMessage}`;

  return (
    <div className="flex gap-1">
      <a
        href={smsHref}
        title="Text a reminder of their total balance"
        aria-label="Send SMS reminder"
        className="rounded-md px-2 py-1 text-sm hover:bg-slate-100"
      >
        💬
      </a>
      <a
        href={whatsAppHref}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp a reminder of their total balance"
        aria-label="Send WhatsApp reminder"
        className="rounded-md px-2 py-1 text-sm hover:bg-slate-100"
      >
        🟢
      </a>
    </div>
  );
}
