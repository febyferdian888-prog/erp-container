# UI Components Documentation

Dokumentasi components yang tersedia di aplikasi ERP.

## Setup

Components menggunakan:
- **Radix UI** - Unstyled, accessible components primitives
- **Tailwind CSS** - Utility-first CSS framework
- **CVA (Class Variance Authority)** - Type-safe component variants
- **Lucide React** - Icon library

## Available Components

### 1. Button

Tombol dengan berbagai variant dan ukuran.

```tsx
import { Button } from "@/components/ui/button"

// Default button
<Button>Click me</Button>

// Variants
<Button variant="default">Default</Button>
<Button variant="destructive">Delete</Button>
<Button variant="outline">Outline</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>

// Sizes
<Button size="default">Default</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button size="icon">🔍</Button>

// Loading state
<Button disabled>Loading...</Button>
```

**Props**: `variant`, `size`, `disabled`, `type`, `onClick`, etc.

---

### 2. Input

Text input field dengan styling.

```tsx
import { Input } from "@/components/ui/input"

<Input placeholder="Enter text..." />
<Input type="email" placeholder="Email" />
<Input type="password" placeholder="Password" />
<Input disabled placeholder="Disabled" />
```

**Props**: `type`, `placeholder`, `disabled`, `value`, `onChange`, `className`, etc.

---

### 3. Label

Label untuk form fields.

```tsx
import { Label } from "@/components/ui/label"

<Label htmlFor="email">Email Address</Label>
<Input id="email" type="email" />
```

**Props**: `htmlFor`, `disabled`, `className`, etc.

---

### 4. Card

Container dengan styling untuk group content.

```tsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>Content here</CardContent>
  <CardFooter>Footer content</CardFooter>
</Card>
```

**Components**:
- `Card` - Container
- `CardHeader` - Top section
- `CardTitle` - Title text
- `CardDescription` - Subtitle text
- `CardContent` - Main content
- `CardFooter` - Bottom section

---

## Layout Components

### DashboardLayout

Sidebar + main content layout untuk dashboard pages.

```tsx
import { DashboardLayout } from "@/components/dashboard-layout"

export default function MyPage() {
  return (
    <DashboardLayout>
      <div>Your page content</div>
    </DashboardLayout>
  )
}
```

**Features**:
- Collapsible sidebar
- Navigation menu
- User profile dropdown
- Top header bar
- Responsive design

---

## Icons

Menggunakan **Lucide React** untuk icons.

```tsx
import { ShoppingCart, DollarSign, Users, BarChart3 } from "lucide-react"

<ShoppingCart size={24} className="text-blue-600" />
<DollarSign size={20} />
<Users />
<BarChart3 />
```

**Common Icons**:
- `Menu`, `ChevronDown`, `LogOut`
- `ShoppingCart`, `Truck`, `DollarSign`
- `BarChart3`, `TrendingUp`, `AlertCircle`
- Plus 1000+ lebih icons

---

## Styling Classes

### Colors

```
Primary: bg-slate-900, text-slate-900
Secondary: bg-slate-100, text-slate-600
Accent: bg-blue-600, text-blue-600
Error: bg-red-600, text-red-600
Success: bg-green-600, text-green-600
```

### Utilities

```
Spacing: p-4, m-4, gap-3, space-y-2
Sizing: w-64, h-10, max-w-lg
Display: flex, grid, hidden, block
Border: border, rounded-lg, rounded-md
Shadow: shadow-sm, shadow-lg
```

---

## Common Patterns

### Form with Label & Input

```tsx
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  return (
    <form className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full">
        Login
      </Button>
    </form>
  )
}
```

### Card with Stats

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign } from "lucide-react"

export function StatCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <DollarSign size={18} />
          Revenue
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">Rp 1.2M</div>
        <p className="text-xs text-slate-500 mt-1">+20% from last month</p>
      </CardContent>
    </Card>
  )
}
```

---

## Component Road Map

**Done** ✅
- Button
- Input
- Card
- Label
- Dashboard Layout
- Icons (Lucide)

**Coming Soon** ⏳
- Dialog/Modal
- Select/Dropdown
- Table
- Tabs
- Toast/Notification
- Pagination
- Breadcrumb
- Badge
- Skeleton

---

## Best Practices

1. **Import from index**: `from "@/components/ui"`
2. **Use composition**: Combine Button + Card for complex layouts
3. **Responsive**: Use `md:` and `lg:` Tailwind breakpoints
4. **Accessibility**: Always use proper labels with inputs
5. **Type safety**: Components are fully typed with TypeScript

---

## Customization

### Changing Colors

Edit Tailwind colors di `tailwind.config.ts`:

```ts
export default {
  theme: {
    extend: {
      colors: {
        primary: "your-color",
      },
    },
  },
}
```

Then update component files:

```tsx
className="bg-primary text-primary-foreground"
```

---

**Last Updated**: 2026-09-15  
**Tailwind Version**: v4  
**Radix UI Version**: Latest
