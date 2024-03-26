const { MongoClient, ServerApiVersion } = require("mongodb");


//const uri = "mongodb://localhost:27017";
const uri = "mongodb+srv://dolissmith0011:Vw0QVGyGXMq8Zmkb@cluster0.dg3llsp.mongodb.net/";
const dbName = "stunner";


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function connectToMongoDB() {
    try {
      await client.connect();
      const db = client.db(dbName);
      return db;
    } catch (error) {
      console.error("Error connecting to MongoDB:", error);
      throw error;
    }
  }

  module.exports = { connectToMongoDB };
