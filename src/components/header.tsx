import Image from "next/image";

export function Header() {
  return (
    <header className="flex items-center justify-between gap-4 px-6 py-4 border-b bg-card">
      <div className="flex items-center gap-2">
        
        {/* THE NEW LOGO CODE */}
        <div className="relative h-10 w-32"> 
          <Image 
            src="/logo.png" 
            alt="Sigma NDT Logo"
            fill
            className="object-contain object-left"
            priority 
          />
        </div>
        <span className="text-xs font-mono text-muted-foreground mt-1">V1</span>
      </div>
    </header>
  );
}
