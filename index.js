require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");


const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.c3nyioy.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = client.db("city-resolved");
    const usersCollection = database.collection("users");
    const issuesCollection = database.collection("issues");
    const timelinesCollection = database.collection("timelines");
    const paymentsCollection = database.collection("payments");

    // MIDDLEWARE: Verify Firebase ID Token
    const verifyToken = async (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'forbidden access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.decoded = decodedToken;
        next();
      } catch (error) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
    };

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };

      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }

      const newUser = {
        name: user.name,
        email: user.email,
        photo: user.photo,
        role: "citizen",
        isVerified: false,
        isBlocked: false,
      };

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    app.get("/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.get('/users', verifyToken, async (req, res) => {
        const role = req.query.role;
        let query = {};
        if (role) {
            query.role = role;
        }
        const result = await usersCollection.find(query).toArray();
        res.send(result);
    });

    app.patch('/users/status/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const { isBlocked } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: { isBlocked: isBlocked }
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
    });

    app.delete('/users/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await usersCollection.deleteOne(query);
        res.send(result);
    });

    app.post("/issues", verifyToken, async (req, res) => {
      const issue = req.body;
      const userEmail = issue.reportedBy.email;

      const user = await usersCollection.findOne({ email: userEmail });

      if (user?.isBlocked) {
        return res
          .status(403)
          .send({ message: "You are blocked from posting issues." });
      }

      if (!user?.isVerified) {
        const count = await issuesCollection.countDocuments({
          "reportedBy.email": userEmail,
        });

        if (count >= 3) {
          return res.send({
            insertedId: null,
            message: "Free limit reached. Please upgrade to Premium.",
          });
        }
      }

      const newIssue = {
        ...issue,
        status: "pending",
        priority: "normal",
        upvotes: 0,
        upvotedBy: [],
        createdAt: new Date(),
      };

      const result = await issuesCollection.insertOne(newIssue);

      const timelineEntry = {
        issueId: result.insertedId,
        status: "pending",
        message: "Issue reported by citizen",
        updatedBy: user.name,
        role: "citizen",
        date: new Date(),
      };

      await timelinesCollection.insertOne(timelineEntry);

      res.send(result);
    });

    app.get("/issues", async (req, res) => {
      // 1. Extract Pagination Parameters (Default to Page 1, 8 items per page)
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12; 
      const skip = (page - 1) * limit;

      // 2. Build Query (Same as before)
      const { search, status, category } = req.query;
      let query = {};

      if (search) {
        query.title = { $regex: search, $options: 'i' };
      }
      if (status) {
        query.status = status;
      }
      if (category) {
        query.category = category;
      }

      // 3. Get Total Count (Crucial for calculating total pages on frontend)
      const total = await issuesCollection.countDocuments(query);

      // 4. Fetch Paginated Data
      const result = await issuesCollection.find(query)
        .sort({ priority: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      
      // 5. Send Response (Includes data AND total count)
      res.send({
          issues: result,
          total
      });
    });

    app.patch('/issues/upvote/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const { userEmail } = req.body;

        const filter = { _id: new ObjectId(id) };
        const issue = await issuesCollection.findOne(filter);

        if (!issue) return res.status(404).send({ message: "Issue not found" });

        if (issue.reportedBy.email === userEmail) {
            return res.send({ message: "You cannot upvote your own issue." });
        }

        if (issue.upvotedBy?.includes(userEmail)) {
            return res.send({ message: "You have already upvoted this issue." });
        }

        const updateDoc = {
            $inc: { upvotes: 1 },
            $push: { upvotedBy: userEmail }
        };

        const result = await issuesCollection.updateOne(filter, updateDoc);
        res.send(result);
    });
    
    app.get('/issues/:id', async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await issuesCollection.findOne(query);
        res.send(result);
    });

    app.delete('/issues/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await issuesCollection.deleteOne(query);
        res.send(result);
    });

    app.patch('/issues/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const item = req.body;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
            $set: {
                title: item.title,
                description: item.description,
                category: item.category,
                location: item.location,
                ...(item.photo && { photo: item.photo }) 
            }
        };
        const result = await issuesCollection.updateOne(filter, updatedDoc);
        res.send(result);
    });

    app.get('/timelines/:issueId', async (req, res) => {
        const issueId = req.params.issueId;
        const query = { issueId: new ObjectId(issueId) };
        const result = await timelinesCollection.find(query).sort({ date: -1 }).toArray();
        res.send(result);
    });

    app.get("/my-issues/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await issuesCollection
        .find({ "reportedBy.email": email })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyToken, async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);

      if (payment.type === "subscription") {
        const filter = { email: payment.email };
        const updateDoc = {
          $set: { isVerified: true },
        };
        await usersCollection.updateOne(filter, updateDoc);
      } else if (payment.type === "boost" && payment.issueId) {
        const filter = { _id: new ObjectId(payment.issueId) };
        const updateDoc = {
          $set: { priority: "high" },
        };
        await issuesCollection.updateOne(filter, updateDoc);

        const timelineEntry = {
          issueId: new ObjectId(payment.issueId),
          status: "boosted",
          message: "Issue priority boosted to High",
          updatedBy: payment.name,
          role: "citizen",
          date: new Date(),
        };
        await timelinesCollection.insertOne(timelineEntry);
      }

      res.send(result);
    });

    app.get("/admin-stats", async (req, res) => {
      const totalUsers = await usersCollection.estimatedDocumentCount();
      const totalIssues = await issuesCollection.estimatedDocumentCount();
      const totalPayments = await paymentsCollection.estimatedDocumentCount();

      const result = await paymentsCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      const pendingIssues = await issuesCollection.countDocuments({
        status: "pending",
      });
      const resolvedIssues = await issuesCollection.countDocuments({
        status: "resolved",
      });

      res.send({
        totalUsers,
        totalIssues,
        totalPayments,
        revenue,
        pendingIssues,
        resolvedIssues,
      });
    });

    // adding user through admin withfirebase admin sdk
    app.post('/users/add-staff', verifyToken, async (req, res) => {
        const { name, email, password } = req.body;

        try {
            
            const userRecord = await admin.auth().createUser({
                email: email,
                password: password,
                displayName: name,
                photoURL: req.body.photo,
                emailVerified: true
            });

            const newStaff = {
                name: name,
                email: email,
                photo: req.body.photo,
                role: 'staff',
                isVerified: true,
                isBlocked: false,
                firebaseUid: userRecord.uid,
                createdAt: new Date()
            };

            const result = await usersCollection.insertOne(newStaff);
            
            res.send({ success: true, result });

        } catch (error) {
            console.error("Error creating staff:", error);
            res.status(500).send({ 
                success: false, 
                message: error.message 
            });
        }
    });
    app.patch('/users/info/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const { name, email } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: {
                name: name,
                email: email
            }
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
    });

    app.patch('/issues/:id/assign', verifyToken, async (req, res) => {
        const id = req.params.id;
        const { staffId, staffName, staffEmail, staffPhoto } = req.body;
        
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: {
                assignedStaff: {
                    staffId,
                    name: staffName,
                    email: staffEmail,
                    photo: staffPhoto
                },
                status: 'in-progress'
            }
        };
        
        const result = await issuesCollection.updateOne(filter, updateDoc);

        const timelineEntry = {
            issueId: new ObjectId(id),
            status: 'in-progress',
            message: `Issue assigned to Staff: ${staffName}`,
            updatedBy: 'Admin',
            role: 'admin',
            date: new Date()
        };
        await timelinesCollection.insertOne(timelineEntry);

        res.send(result);
    });

    app.patch('/issues/:id/reject', verifyToken, async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: { status: 'rejected' }
        };
        const result = await issuesCollection.updateOne(filter, updateDoc);

        const timelineEntry = {
            issueId: new ObjectId(id),
            status: 'rejected',
            message: 'Issue rejected by Admin',
            updatedBy: 'Admin',
            role: 'admin',
            date: new Date()
        };
        await timelinesCollection.insertOne(timelineEntry);

        res.send(result);
    });
    app.get('/payments', verifyToken, async (req, res) => {
        const result = await paymentsCollection.find().sort({ date: -1 }).toArray();
        res.send(result);
    });
    app.get('/staff-stats/:email', verifyToken, async (req, res) => {
        const email = req.params.email;
        const query = { 'assignedStaff.email': email };
        
        const totalAssigned = await issuesCollection.countDocuments(query);
        const totalResolved = await issuesCollection.countDocuments({ ...query, status: 'resolved' });
        const totalClosed = await issuesCollection.countDocuments({ ...query, status: 'closed' });

        res.send({ totalAssigned, totalResolved, totalClosed });
    });

    app.get('/issues/assigned/:email', verifyToken, async (req, res) => {
        const email = req.params.email;
        const result = await issuesCollection.find({ 'assignedStaff.email': email })
            .sort({ priority: 1, createdAt: -1 })
            .toArray();
        res.send(result);
    });

    app.patch('/issues/status/:id', verifyToken, async (req, res) => {
        const id = req.params.id;
        const { status, userEmail, userName } = req.body;
        
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { status: status } };
        const result = await issuesCollection.updateOne(filter, updateDoc);

        const timelineEntry = {
            issueId: new ObjectId(id),
            status: status,
            message: `Status changed to ${status}`,
            updatedBy: userName,
            role: 'staff',
            date: new Date()
        };
        await timelinesCollection.insertOne(timelineEntry);

        res.send(result);
    });
    app.get('/issues/resolved/recent', async (req, res) => {
        const result = await issuesCollection.find({ status: 'resolved' })
            .sort({ createdAt: -1 })
            .limit(6)
            .toArray();
        res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("this serve is running");
});
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});