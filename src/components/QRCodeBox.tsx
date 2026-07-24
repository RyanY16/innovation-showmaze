"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QRCodeBox({ value }: { value: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 240, color: { dark: "#14151b", light: "#f4e7c4" } }).then(setSrc);
  }, [value]);

  return (
    <div className="inline-block border-[4px] border-cyan bg-bone p-3 shadow-pixel">
      {src ? <img src={src} alt="Room QR code" className="h-40 w-40" /> : <div className="h-40 w-40 bg-bone" />}
    </div>
  );
}
