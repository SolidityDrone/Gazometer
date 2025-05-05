'use client';

import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center pt-20">
      <h1 className="text-7xl font-bold text-green-500 mb-8 tracking-wider">
        GAZOMETER
      </h1>
      <Image
        src="/gazometer_logo.png"
        alt="Gazometer Logo"
        width={512}
        height={512}
        className="mb-8"
      />
      <h2 className="text-4xl font-bold text-green-500">
        Privacy-first payment protocol
      </h2>
    </div>
  );
}
