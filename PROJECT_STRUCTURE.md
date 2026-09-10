# FB Pulse Tracker

React + TypeScript + Ant Design + Vite application for tracking Facebook engagement metrics.

## Project Structure

```
src/
├── components/          # Reusable components
│   ├── AccountsTable.tsx    # Tracked accounts table
│   ├── BarChart.tsx         # Bar chart visualization
│   ├── EngagementChart.tsx  # Engagement overview section
│   ├── Header.tsx           # Page header with navigation
│   ├── LineChart.tsx        # Line chart (legacy)
│   └── StatsCards.tsx       # Statistics cards (Likes, Comments, Shares)
├── pages/              # Page components
│   ├── HomePage.tsx         # Main dashboard page
│   └── DetailPage.tsx       # Account detail page
├── App.tsx             # Router configuration
└── main.tsx            # Application entry point
```

## Features

- ✅ Dashboard with engagement statistics
- ✅ Interactive data visualization
- ✅ Tracked accounts table
- ✅ Routing setup for detail pages
- 🚧 Detail page (coming soon)

## Routes

- `/` - Home page (Dashboard)
- `/detail/:id` - Account detail page

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Tech Stack

- **Framework**: React 19
- **Language**: TypeScript
- **UI Library**: Ant Design
- **Build Tool**: Vite
- **Routing**: React Router DOM
- **Icons**: Ant Design Icons

## Components

### Header

Navigation header with time filters and import buttons

### StatsCards

Display key metrics: Total Likes, Comments, and Shares

### EngagementChart

Bar chart showing engagement breakdown by account

### AccountsTable

Table showing tracked accounts with actions (view, edit, copy)

### DetailPage

Placeholder for future account detail implementation

## Next Steps

- [ ] Implement account detail page
- [ ] Add data fetching and state management
- [ ] Add charts library (Chart.js / Recharts)
- [ ] Add filters and search functionality
- [ ] Implement CRUD operations for accounts
