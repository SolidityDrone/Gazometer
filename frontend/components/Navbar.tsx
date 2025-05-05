'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

export default function Navbar() {
    const pathname = usePathname();

    return (
        <nav className="fixed top-0 left-0 right-0 bg-gray-900/50 backdrop-blur-sm shadow-lg z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center">
                        <Image
                            src="/gazometer_logo.png"
                            alt="Gazometer Logo"
                            width={64}
                            height={64}
                            className="mr-4"
                        />
                        <Link href="/" className="text-xl font-bold text-white hover:text-green-300 transition-colors duration-200">
                            Gazometer
                        </Link>
                    </div>
                    <div className="hidden md:block">
                        <div className="ml-10 flex items-baseline space-x-4">
                            <Link
                                href="/"
                                className={`px-3 py-2 text-sm font-medium transition-colors duration-200 ${pathname === '/'
                                    ? 'bg-green-600/50 text-white'
                                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
                                    }`}
                            >
                                Home
                            </Link>
                            <Link
                                href="/initialize"
                                className={`px-3 py-2 text-sm font-medium transition-colors duration-200 ${pathname === '/initialize'
                                    ? 'bg-green-600/50 text-white'
                                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
                                    }`}
                            >
                                Initialize
                            </Link>
                            <Link
                                href="/sign"
                                className={`px-3 py-2 text-sm font-medium transition-colors duration-200 ${pathname === '/sign'
                                    ? 'bg-green-600/50 text-white'
                                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
                                    }`}
                            >
                                Sign
                            </Link>
                            <Link
                                href="/self-service"
                                className={`px-3 py-2 text-sm font-medium transition-colors duration-200 ${pathname === '/self-service'
                                    ? 'bg-green-600/50 text-white'
                                    : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
                                    }`}
                            >
                                Self Service
                            </Link>
                            <appkit-button />
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
} 