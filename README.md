<div align="center">

<img src="[https://capsule-render.vercel.app/api?type=waving&color=0f172a&height=200&section=header&text=CityResolved%20Backend&fontSize=80&fontColor=38bdf8&animation=fadeIn&fontAlignY=35](https://www.google.com/search?q=https://capsule-render.vercel.app/api%3Ftype%3Dwaving%26color%3D0f172a%26height%3D200%26section%3Dheader%26text%3DCityResolved%2520Backend%26fontSize%3D80%26fontColor%3D38bdf8%26animation%3DfadeIn%26fontAlignY%3D35)" width="100%" />

<p align="center">
<a href="[https://city-resolved.web.app/](https://city-resolved.web.app/)">
<img src="[https://img.shields.io/badge/Live_Site-FF5722?style=for-the-badge&logo=firebase&logoColor=white](https://www.google.com/search?q=https://img.shields.io/badge/Live_Site-FF5722%3Fstyle%3Dfor-the-badge%26logo%3Dfirebase%26logoColor%3Dwhite)" alt="Live Site" />
</a>
<a href="[https://github.com/S-Arafin/City-Resolved](https://github.com/S-Arafin/City-Resolved)">
<img src="[https://img.shields.io/badge/Client_Repo-2ea44f?style=for-the-badge&logo=github&logoColor=white](https://www.google.com/search?q=https://img.shields.io/badge/Client_Repo-2ea44f%3Fstyle%3Dfor-the-badge%26logo%3Dgithub%26logoColor%3Dwhite)" alt="Client Repo" />
</a>
</p>

<p align="center">
<b>Secure REST API Architecture powering the CityResolved platform.</b>




Built with Node.js, Express, MongoDB, and Firebase Admin SDK.
</p>

</div>

---

## 📖 Table of Contents

* [✨ Overview](https://www.google.com/search?q=%23-overview)
* [⚙️ Tech Stack](https://www.google.com/search?q=%23-tech-stack)
* [🛡️ Security Architecture](https://www.google.com/search?q=%23-security-architecture)
* [🚀 Key Features](https://www.google.com/search?q=%23-key-features)
* [🔌 API Endpoints](https://www.google.com/search?q=%23-api-endpoints)
* [🛠️ Setup & Installation](https://www.google.com/search?q=%23-setup--installation)
* [🔑 Environment Variables](https://www.google.com/search?q=%23-environment-variables)

---

## ✨ Overview

The **CityResolved Backend** serves as the central logic hub for the application. It handles user authentication verification via Firebase Admin, manages Role-Based Access Control (RBAC) for Admins, Staff, and Citizens, and processes secure payments via Stripe. It connects to a MongoDB database to store issues, user profiles, and timeline logs.

---

## ⚙️ Tech Stack

| Component | Technology | Description |
| --- | --- | --- |
| **Runtime** |  | JavaScript runtime environment. |
| **Framework** |  | Minimalist web framework for API routing. |
| **Database** |  | NoSQL database for flexible document storage. |
| **Auth** |  | Server-side token verification & user management. |
| **Payments** |  | Secure payment intent creation & processing. |
| **Security** |  | JSON Web Tokens for session security. |

---

## 🛡️ Security Architecture

This API implements a **Zero Trust** security model for sensitive routes:

1. **JWT Verification Middleware (`verifyToken`):**
* Intercepts every request to protected routes.
* Validates the `Authorization: Bearer <token>` header using `firebase-admin`.
* Rejects requests with expired or manipulated tokens immediately (401 Unauthorized).


2. **Role-Based Access Control (RBAC):**
* **Admin Middleware (`verifyAdmin`):** Checks the database to ensure the requester has the `role: 'admin'`. Used for `/users` and `/stats` endpoints.
* **Staff Middleware (`verifyStaff`):** Ensures the user has `role: 'staff'` before allowing status updates on issues.


3. **Secure Environment Variables:**
* Database credentials and Stripe keys are accessed via `process.env` and never exposed in the codebase.



---

## 🚀 Key Features

* **User Management:** Create, Read, Update, and Delete (CRUD) operations for Users with role assignment.
* **Issue Tracking:** Complex aggregation pipelines to filter issues by status, priority, and assigned staff.
* **Payment Integration:** Generates `clientSecret` for Stripe Payment Intents to handle secure transactions on the client side.
* **Timeline Logging:** Automatically creates a history log entry whenever an issue's status is changed or it receives a priority boost.
* **Admin Analytics:** Aggregates data from multiple collections to provide real-time statistics (Total Revenue, Issue Counts) for the dashboard.

---

## 🔌 API Endpoints

### 👤 Users

| Method | Endpoint | Description | Access |
| --- | --- | --- | --- |
| `POST` | `/users` | Create a new user (Google/Email login). | Public |
| `GET` | `/users` | Get all users (filter by role). | **Admin** |
| `GET` | `/users/:email` | Get single user details. | Private |
| `PATCH` | `/users/status/:id` | Block/Unblock a user. | **Admin** |
| `POST` | `/users/add-staff` | Create a staff account securely. | **Admin** |

### 📋 Issues

| Method | Endpoint | Description | Access |
| --- | --- | --- | --- |
| `POST` | `/issues` | Report a new issue. | Private |
| `GET` | `/issues` | Get all issues (with pagination/search). | Public |
| `PATCH` | `/issues/:id/assign` | Assign an issue to a staff member. | **Admin** |
| `PATCH` | `/issues/status/:id` | Update issue status (e.g., Resolved). | **Staff** |
| `PATCH` | `/issues/upvote/:id` | Upvote an issue. | Private |

### 💳 Payments

| Method | Endpoint | Description | Access |
| --- | --- | --- | --- |
| `POST` | `/create-payment-intent` | Generate Stripe client secret. | Private |
| `POST` | `/payments` | Save payment record & boost issue/user. | Private |
| `GET` | `/admin-stats` | Get aggregated system analytics. | **Admin** |

---

## 🛠️ Setup & Installation

To run this server locally, follow these steps:

**1. Clone the repository:**

```bash
git clone https://github.com/S-Arafin/City-Resolved-Backend.git
cd City-Resolved-Backend

```

**2. Install dependencies:**

```bash
npm install

```

**3. Configure Environment Variables:**
Create a `.env` file in the root directory (see below).

**4. Start the server:**

```bash
# Production mode
npm start

# Development mode (with Nodemon)
npm run dev

```

---

## 🔑 Environment Variables

Create a `.env` file in the root folder and add the following keys:

```env
# Database Configuration
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password

# Authentication & Security
ACCESS_TOKEN_SECRET=your_random_jwt_secret_string
FB_SERVICE_KEY=your_base64_encoded_firebase_service_account

# Payment Gateway
STRIPE_SECRET_KEY=your_stripe_secret_key

```

<div align="center">
<sub>Developed by <b>Sultanul Arafin</b> | Part of the CityResolved Project</sub>
</div>