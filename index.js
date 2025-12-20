require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

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
  }
});

async function run() {
  try {
    const database = client.db("city-resolved");
    const usersCollection = database.collection('users');
    const issuesCollection = database.collection('issues');
    const timelinesCollection = database.collection('timelines');

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      
      const existingUser = await usersCollection.findOne(query);
      
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }

      const newUser = {
        name: user.name,
        email: user.email,
        photo: user.photo,
        role: 'citizen', 
        isVerified: false, 
        isBlocked: false 
      }
      
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    app.post('/issues', async (req, res) => {
      const issue = req.body;
      const userEmail = issue.reportedBy.email;

      const user = await usersCollection.findOne({ email: userEmail });

      if (user?.isBlocked) {
        return res.status(403).send({ message: "You are blocked from posting issues." });
      }

      if (!user?.isVerified) {
        const count = await issuesCollection.countDocuments({ 
            'reportedBy.email': userEmail 
        });
        
        if (count >= 3) {
            return res.send({ 
              insertedId: null, 
              message: "Free limit reached. Please upgrade to Premium." 
            });
        }
      }

      const newIssue = {
        ...issue,
        status: 'pending',
        priority: 'normal',
        upvotes: 0,
        upvotedBy: [],
        createdAt: new Date()
      };

      const result = await issuesCollection.insertOne(newIssue);

      const timelineEntry = {
        issueId: result.insertedId,
        status: 'pending',
        message: 'Issue reported by citizen',
        updatedBy: user.name,
        role: 'citizen',
        date: new Date()
      };
      
      await timelinesCollection.insertOne(timelineEntry);

      res.send(result);
    });

    app.get('/my-issues/:email', async (req, res) => {
        const email = req.params.email;
        const result = await issuesCollection.find({ 'reportedBy.email': email })
            .sort({ createdAt: -1 })
            .toArray();
        res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);

app.get('/',(req, res)=>{
    res.send('this serve is running')
})
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});