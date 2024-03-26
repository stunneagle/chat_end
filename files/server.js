const express = require("express");
const passport = require("passport");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { connectToMongoDB } = require("./mongoDB");
const session = require("express-session");
const http = require("http");
const jwt = require('jsonwebtoken');
const socketIo = require("socket.io");
//const conversationRouter = require("./route");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Middleware to parse JSON request bodies
app.use(express.json());

// Initialize express-session middleware before Passport middleware
app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: false,
  })
);

// Initialize Passport.js middleware
app.use(passport.initialize());
app.use(passport.session());

app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
// Connect to MongoDB
const dbPromise = connectToMongoDB();

// Define a middleware to attach the database connection to the request object
app.use(async (req, res, next) => {
  req.db = await dbPromise;
  next();
});



app.get("/userProfile/:username", async (req, res) => {
  try {
   
    const username = req.params.username;
    const db = req.db;

    const userProfile = await db.collection("users").findOne({ username });

    // Check if user profile exists
    if (userProfile) {
      // Send user profile data as response
      res.json(userProfile);
    } else {
      // If user profile does not exist, send error response
      res.status(404).json({ error: "User profile not found" });
    }
  } catch (error) {
    // Handle errors
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Failed to fetch user profile" });
  }
});

// Define a route to update user profile
app.put("/updateprofile/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const { fullName, email, password } = req.body;

    const db = req.db;

    // Check if the user exists
    const existingUser = await db.collection("users").findOne({ username });
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update user profile fields
    existingUser.fullName = fullName;
    existingUser.email = email;

    // If password is provided, hash and update
    if (password) {
      existingUser.password = await bcrypt.hash(password, 10);
    }

    // Update user profile in the database
    await db.collection("users").updateOne({ username }, { $set: existingUser });

    res.status(200).json({ message: "User profile updated successfully" });
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({ message: "Failed to update user profile" });
  }
});

// Define a route to fetch all conversation names
app.get("/loadconversations/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const db = req.db;
    const conversations = await db
      .collection("conversations")
      .find({ participants: username })
      .toArray();
    const conversationNames = conversations.map(
      (conversation) => conversation.name
    );
    res.json({ conversations: conversationNames });
    // Inside useEffect
    console.log("Fetched conversations:", conversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ message: "Failed to fetch conversations" });
  }
});

// Create a new conversation
app.post("/createconversation", async (req, res) => {
  try {
    let { name, participants } = req.body;

    // Sanitize conversation name
    name = name.trim();
    if (!name) {
      return res
        .status(400)
        .json({ message: "Conversation name cannot be empty" });
    }
    if (name.includes(" ")) {
      return res
        .status(400)
        .json({ message: "Conversation name cannot contain spaces" });
    }

    const db = req.db;
    // Check if conversation name already exists
    const existingConversation = await db
      .collection("conversations")
      .findOne({ name });
    if (existingConversation) {
      return res
        .status(400)
        .json({ message: "Conversation name already exists" });
    }

    const result = await db
      .collection("conversations")
      .insertOne({ name, participants });
    res
      .status(201)
      .json({
        message: "Conversation created successfully",
        conversationName: result.insertedId,
      });
  } catch (error) {
    console.error("Error creating conversation:", error);
    res.status(500).json({ message: "Failed to create conversation" });
  }
});

// Join an existing conversation
app.post("/joinconversation", async (req, res) => {
  try {
    let { conversationName, username } = req.body;

    // Sanitize conversation name
    conversationName = conversationName.trim();
    if (!conversationName) {
      return res
        .status(400)
        .json({ message: "Conversation name cannot be empty" });
    }

    const db = req.db;
    // Check if the conversation exists
    const conversation = await db
      .collection("conversations")
      .findOne({ name: conversationName });
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if the user is already a participant
    if (conversation.participants.includes(username)) {
      return res
        .status(400)
        .json({
          message: "You are already a participant in this conversation",
        });
    }

    // Add user to the participants list
    conversation.participants.push(username);
    await db
      .collection("conversations")
      .updateOne(
        { name: conversationName },
        { $set: { participants: conversation.participants } }
      );

    res
      .status(200)
      .json({ message: "Joined conversation successfully", conversationName });
  } catch (error) {
    console.error("Error joining conversation:", error);
    res.status(500).json({ message: "Failed to join conversation" });
  }
});

// Leave conversation route
app.delete("/leaveconversation/:conversationName/:username", async (req, res) => {
  try {
    const { conversationName, username } = req.params;

    const db = req.db;

    // Check if the conversation exists
    const conversation = await db
      .collection("conversations")
      .findOne({ name: conversationName });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Check if the user is a participant in the conversation
    if (!conversation.participants.includes(username)) {
      return res.status(400).json({ message: "You are not a participant in this conversation" });
    }

    // Remove the user from the participants list
    const updatedParticipants = conversation.participants.filter(participant => participant !== username);

    // Update the conversation with the new participants list
    await db.collection("conversations").updateOne(
      { name: conversationName },
      { $set: { participants: updatedParticipants } }
    );

    res.status(200).json({ message: "Left conversation successfully" });
  } catch (error) {
    console.error("Error leaving conversation:", error);
    res.status(500).json({ message: "Failed to leave conversation" });
  }
});

// Delete conversation route
app.delete("/deleteconversation/:conversationName", async (req, res) => {
  try {
    const { conversationName } = req.params;

    const db = req.db;

    // Delete the conversation
    await db.collection("conversations").deleteOne({ name: conversationName });

    res.status(200).json({ message: "Conversation deleted successfully" });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    res.status(500).json({ message: "Failed to delete conversation" });
  }
});

// Login route
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const db = req.db;
    const user = await db.collection("users").findOne({ username });

    if (!user) {
      console.log("User not found:", username);
      return res.status(401).json({ message: "Incorrect username." });
    }

    // Compare passwords
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      console.log("Incorrect password for user:", username);
      return res.status(401).json({ message: "Incorrect password." });
    }

    const token = generateToken(user);
   

    res.json({ message: "Login successful", token});
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "An error occurred during login." });
  }
});

// Register route
app.post("/register", async (req, res) => {
  try {
    const db = req.db;
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const newUser = {
      id: uuidv4(), // Generate unique user ID
      username: req.body.username,
      password: hashedPassword,
      email: req.body.email,
      fullName: req.body.fullName,
    };
    console.log("New user object:", newUser);
    await db.collection("users").insertOne(newUser);
    const token = generateToken(newUser);
    console.log("User registered successfully:", req.body.username);
    res.status(201).json({ message: "User created successfully", token });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ message: "Failed to create user" });
  }
});

// Logout route
app.get("/logout", (req, res) => {
  req.logout();
  res.json({ message: "Logout successful" });
});

// Define a route to fetch messages for a conversation ID
app.get("/messages/:conversationName", async (req, res) => {
  try {
    // Extract conversation ID from request parameters
    const { conversationName } = req.params;

    const db = req.db;

    // Retrieve messages for the specified conversation ID
    const messages = await db
      .collection("messages")
      .find({ conversationName })
      .toArray();

    // Send the messages as a response
    res.json({ messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

// WebSocket server
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const decoded = jwt.verify(token, 'your_secret_key');
    socket.user = decoded;
    // Attach db connection to socket after successful authentication
    socket.db = await connectToMongoDB();

    next();
  } catch (error) {
    console.error("Error authenticating socket:", error);
    console.log("Invalid token, authentication failed");
    next(new Error("Authentication error"));
  }
});


io.on("connection", (socket) => {
  console.log("User connected:", socket.user.username);

  socket.on("join", (conversationName) => {
    socket.join(conversationName);
  });

  socket.on("sendMessage", async (message) => {
    try {

     
      if (!socket.db) {
        console.error("Database connection not available");
        return;
      }

      await socket.db.collection("messages").insertOne({
        text: message.text,
        sender: message.sender,
        conversationName: message.conversationName,
      });

      io.to(message.conversationName).emit("message", message);
    } catch (error) {
      console.error("Error storing message:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.user.username);
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = { app, connectToMongoDB };




// Function to generate JWT token
function generateToken(user) {
  // You can customize the token payload as needed
  const payload = {
    id: user.id,
    username: user.username,
  };

  // Sign the JWT token with a secret key
  return jwt.sign(payload, 'your_secret_key', { expiresIn: '876000h' }); // Token expires in 1 hour
}

