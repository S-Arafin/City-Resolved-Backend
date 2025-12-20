require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;

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

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.post("/issues", async (req, res) => {
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

      const result = await issuesCollection.find(query)
        .sort({ priority: 1, createdAt: -1 })
        .toArray();
      
      res.send(result);
    });

    app.patch('/issues/upvote/:id', async (req, res) => {
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

    app.get("/my-issues/:email", async (req, res) => {
      const email = req.params.email;
      const result = await issuesCollection
        .find({ "reportedBy.email": email })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
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

    app.post("/payments", async (req, res) => {
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

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
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