export const metadata = { title: "Pinbox" };

// Dark by default (ignores the system setting). Applies a saved light choice from the sidebar moon button before first paint.
// The key is versioned so an older saved "light" from before dark became the default is ignored.
const THEME = `try{var t=localStorage.getItem("pinbox-theme-v2");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Mulish:wght@400;600;700;800&family=Titillium+Web:wght@400;600;700&family=Tomorrow:wght@400;500&family=Sunflower:wght@300;500;700&family=Tilt+Warp&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
