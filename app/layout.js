import "./globals.css";

export const metadata = {
  title: "Kasi Eats - Food and Stuff | Mabopane",
  description: "Browse the Kasi Eats menu in Mabopane, Pretoria. Request collection or local delivery and order directly with the business.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
