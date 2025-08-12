import type { Metadata } from 'next'
import { Roboto } from 'next/font/google'
import '../index.css'

const roboto = Roboto({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-roboto',
})

export const metadata: Metadata = {
  title: 'Project Nova',
  description: 'AI-powered hiring assistant',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      </head>
      <body className={roboto.className}>{children}</body>
    </html>
  )
}