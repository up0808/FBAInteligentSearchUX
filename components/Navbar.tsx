import React from "react";
import { UserButton, useUser } from "@clerk/nextjs";

const Navbar: React.FC = () => {
    const { user } = useUser();
    return (
        <header
            role="banner"
            className="fixed top-0 left-0 right-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-black/50 bg-black/80 text-white"
        >
            <div className="mx-auto max-w-4xl px-4 h-14 flex items-center justify-between">
                <div className="font-semibold tracking-tight">Intelligence Search</div>
                <div className="flex items-center gap-3 text-sm">
                    {user && <span className="hidden sm:block text-white/80">{user.fullName}</span>}
                    <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonPopoverCard: "bg-white" } }} />
                </div>
            </div>
        </header>
    );
};

export default Navbar;