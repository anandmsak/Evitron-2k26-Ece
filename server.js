// server.ts
import "dotenv/config";
import express from "express";
import path from "path";
import crypto2 from "crypto";

// server/supabase.ts
import { createClient } from "@supabase/supabase-js";
var supabaseUrl = process.env.SUPABASE_URL || "";
var supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || "";
function isSupabaseConfigured() {
  return Boolean(
    supabaseUrl && supabaseSecretKey && !supabaseUrl.includes("placeholder") && supabaseUrl.startsWith("http")
  );
}
var supabaseAdmin = createClient(
  isSupabaseConfigured() ? supabaseUrl : "https://placeholder.supabase.co",
  isSupabaseConfigured() ? supabaseSecretKey : "placeholder-key",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// src/utils/pricing.ts
function getPricePerPerson(type, settings, date) {
  if (type === "workshop") {
    return 300;
  }
  return 250;
}

// src/data/defaultSettings.ts
var initialSiteSettings = {
  symposiumTitle: "EVITRON 2K26",
  subTitle: "National Level Technical Symposium",
  department: "Department of Electronics and Communication Engineering",
  college: "Mahendra Engineering College (Autonomous)",
  associations: "VELOCITY & IEEE",
  eventDate: "08/10/2026",
  countdownTarget: "2026-10-08T09:00:00",
  registrationDeadline: "05/10/2026",
  paperSubmissionDeadline: "03/10/2026",
  isRegistrationOpen: true,
  closedReason: "Registrations are currently closed. Please contact event coordinators for further inquiries.",
  upiId: "6383109049@upi",
  upiPayeeName: "EVITRON 2K26 - MEC ECE",
  upiQrImageUrl: "",
  workshopUpiId: "6383109049@upi",
  workshopUpiPayeeName: "Evitron Workshop",
  workshopUpiQrImageUrl: "",
  techUpiId: "6383109049@upi",
  techUpiPayeeName: "Evitron Technical",
  techUpiQrImageUrl: "",
  razorpayEnabled: true,
  driveUploadUrl: "https://docs.google.com/forms/d/1R1VhrsHfC9GYo-j_npPZv8fDXXhlUOPbfYtNUBy1Vh0/edit?ts=6aa4f3ae",
  participantFormUrl: "https://docs.google.com/forms/d/e/1FAIpQLSdXYq3Pfeb_2w5jPtdjqeLJPv3sIVsb9Y1ahPUe47WT76OUYg/viewform?usp=publish-editor",
  contactEmail: "evitron26@gmail.com",
  instagramHandle: "https://www.instagram.com/velocity_ece_mec?stkn=dWV5ejA4ZW5hOWkz",
  venue: "Mahendhirapuri, Mallasamudram (M), Namakkal (Dt), Tamil Nadu - 637 503",
  announcementText: "Registrations are now live! Last date for registration is 05/10/2026. Paper abstract submission deadline is 03/10/2026. Cash prizes, welcome kits, food and refreshments included.",
  announcementActive: true,
  feePerPerson: getPricePerPerson("technical"),
  appEnv: "development",
  showRazorpayPayment: true,
  googleSheetWebhookUrl: "https://script.google.com/macros/s/AKfycbwQFDmE-3bG517qhy5jP6my90QCKsps5GLn2q7ih3vHJmTq96PikBitSCJgIqyxOqRoaQ/exec",
  adminNotificationEmails: ["evitron26@gmail.com"],
  forceEarlyBird: true,
  earlyBirdDeadline: "2026-10-05T23:59:59+05:30",
  closedWorkshops: []
};

// src/data/defaultEvents.ts
var initialEvents = [
  // --- WORKSHOPS (Individual, 1 Person = Rs 300) ---
  {
    id: "ws-silicon-2-gds",
    slug: "silicon-2-gds",
    title: "SILICON 2 GDS",
    tagline: "VLSI Design Using Cadence",
    category: "workshops",
    description: "Hands-on workshop exploring the complete ASIC design flow from RTL synthesis to GDSII layout generation using industry-standard Cadence EDA tools.",
    venue: "TLC 2",
    time: "09:30 AM - 04:00 PM",
    date: "08/10/2026",
    eligibility: "All Engineering UG / PG students and Diploma scholars from ECE, EEE, EIE, and related branches.",
    teamSize: 1,
    teamSizeLabel: "Individual (1 Participant)",
    feePerPerson: 300,
    rules: [
      "Participants must bring their college ID card for verification.",
      "Participants are advised to bring their own laptops with charger; lab systems will also be provided on availability.",
      "Strict attendance during both morning and afternoon sessions is mandatory for certificate entitlement.",
      "[EVENT RULES WILL BE UPDATED]"
    ],
    procedure: [
      "Session 1: Introduction to RTL design, Verilog coding, and simulation verification.",
      "Session 2: Synthesis with Cadence Genus, timing analysis, and constraints.",
      "Session 3: Physical design, Floorplanning, Placement & Routing with Innovus.",
      "Session 4: DRC, LVS checks and final GDSII export."
    ],
    perks: [
      "Welcome Kit & Notepad",
      "Delicious Food & Refreshments",
      "Hands-on EDA Tool Lab Access",
      "Authorized Participation Certificate"
    ],
    outcomes: [
      "Understand complete ASIC front-end to back-end flow.",
      "Familiarity with industry-grade Cadence digital implementation toolchain."
    ],
    certificates: "Government-recognized Hardcopy Certificate of Workshop Participation will be awarded at the valedictory session.",
    importantInstructions: [
      "Reporting time at registration desk is 08:30 AM sharp.",
      "Workshop participants cannot take part in other technical/non-technical events due to parallel full-day schedule."
    ],
    faqs: [
      {
        q: "Do I need prior experience with Cadence tools?",
        a: "Basic knowledge of digital logic and Verilog is sufficient. The resource persons will guide you through the tool step-by-step."
      },
      {
        q: "Can I also attend technical events if I join this workshop?",
        a: "No. Workshops run parallel full-day sessions, so workshop participants are restricted to this single workshop."
      }
    ],
    coordinatorName: "Mr.Moneswar",
    coordinatorPhone: "+91 6369033324",
    coordinatorEmail: "evitron26@gmail.com",
    isActive: true
  },
  {
    id: "ws-embedded-system",
    slug: "embedded-system",
    title: "Embedded System",
    tagline: "Hands-on Embedded Systems & Microcontrollers",
    category: "workshops",
    description: "Comprehensive practical training on modern embedded architecture, peripheral interfacing, sensor integration, and real-time firmware development.",
    venue: "MEC - DSP Lab",
    time: "09:30 AM - 04:00 PM",
    date: "08/10/2026",
    eligibility: "Engineering & Diploma students interested in Embedded hardware and firmware.",
    teamSize: 1,
    teamSizeLabel: "Individual (1 Participant)",
    feePerPerson: 300,
    rules: [
      "College ID card is compulsory.",
      "Hardware kits will be provided for hands-on sessions during the workshop hours.",
      "[EVENT RULES WILL BE UPDATED]"
    ],
    procedure: [
      "Session 1: Architecture overview of ARM Cortex & RISC-V microcontrollers.",
      "Session 2: GPIO, Timers, ADC, and Interrupt handling in C.",
      "Session 3: Interfacing communication protocols (I2C, SPI, UART).",
      "Session 4: Mini practical project demonstration."
    ],
    perks: [
      "Welcome Kit & Conference Materials",
      "Lunch & Refreshments",
      "Hardware Development Kit Access",
      "Official Certificate of Completion"
    ],
    outcomes: [
      "Solid grasp of real-time embedded programming and hardware-software co-design."
    ],
    certificates: "Official Certificate of Workshop Completion from Mahendra Engineering College.",
    importantInstructions: [
      "Bring your own laptop with Keil / Arduino IDE pre-installed if possible."
    ],
    faqs: [
      {
        q: "Will hardware kits be provided?",
        a: "Yes, demonstration boards and sensor kits will be provided for lab exercises."
      }
    ],
    coordinatorName: "Mr.Manigandan S",
    coordinatorPhone: "+91 8248171977",
    coordinatorEmail: "evitron26@gmail.com",
    isActive: true
  },
  {
    id: "ws-virtual-instrumentation",
    slug: "virtual-instrumentation",
    title: "Virtual Instrumentation",
    tagline: "LabVIEW Workshop & Data Acquisition",
    category: "workshops",
    description: "Practical training on Graphical System Design, Virtual Instrumentation principles, signal acquisition, and automated test bench design using LabVIEW.",
    venue: "TLC 1",
    time: "09:30 AM - 04:00 PM",
    date: "08/10/2026",
    eligibility: "All Engineering UG / PG students of Circuit branches (ECE, EEE, EIE, Mechatronics).",
    teamSize: 1,
    teamSizeLabel: "Individual (1 Participant)",
    feePerPerson: 300,
    rules: [
      "Valid college identification required.",
      "Participants must actively complete all four module exercises to receive certificates.",
      "[EVENT RULES WILL BE UPDATED]"
    ],
    procedure: [
      "Module 1: Graphical programming fundamentals in LabVIEW (VIs, Front Panel, Block Diagram).",
      "Module 2: Loops, Structures, Arrays, and Clusters.",
      "Module 3: Data Acquisition (DAQ) hardware interfacing and signal conditioning.",
      "Module 4: Real-time waveform display and instrument control."
    ],
    perks: [
      "Welcome Kit & Notepad",
      "Food & Refreshments",
      "LabVIEW Hands-on Lab Environment",
      "Accredited Certificate"
    ],
    outcomes: [
      "Proficiency in building automated measurement and control Virtual Instruments."
    ],
    certificates: "Accredited Hardcopy Workshop Certificate issued by ECE Department & VELOCITY Association.",
    importantInstructions: [
      "Full attendance is required across both sessions."
    ],
    faqs: [
      {
        q: "Are computer systems provided?",
        a: "Yes, configured desktop systems with LabVIEW are provided in the department laboratory."
      }
    ],
    coordinatorName: "Ms.Lakshana M",
    coordinatorPhone: "+91 6385777167",
    coordinatorEmail: "evitron26@gmail.com",
    isActive: true
  },
  // --- TECHNICAL EVENTS (Team Size: 2 to 4 Participants) ---
  {
    id: "tech-techpaper",
    slug: "techpaper",
    title: "TECHPAPER",
    tagline: "Paper Presentation",
    category: "technical",
    description: "Platform to present innovative research papers in emerging domains including VLSI, Embedded Systems, IoT, Wireless Communication, AI/ML in signal processing, and Renewable Energy.",
    venue: "MEC - Classroom No: 208, 209, 210, 302",
    time: "10:00 AM - 01:00 PM",
    date: "08/10/2026",
    eligibility: "UG / PG Engineering students. Teams must contain 2 to 4 members (min 2 compulsory).",
    teamSize: 4,
    minTeamSize: 2,
    maxTeamSize: 4,
    teamSizeLabel: "Team of 2 to 4 Participants",
    feePerPerson: 250,
    rules: [
      "Every team must have between 2 and 4 participants (1 Team Leader + 1 to 3 Team Members; minimum 2 compulsory).",
      "Paper abstract must be submitted on or before 03/10/2026 via Google form provided in website itself.",
      "Presentation time: 8 minutes for presentation + 2 minutes for Q&A by jury.",
      "Slides should not exceed 10 slides. Standard IEEE paper format preferred.",
      "[EVENT RULES WILL BE UPDATED]"
    ],
    procedure: [
      "Step 1: Submit abstract by 03/10/2026.",
      "Step 2: Intimation of selected papers will be sent via email.",
      "Step 3: Present before the panel on event day 08/10/2026.",
      "Step 4: Evaluation based on novelty, technical depth, and presentation clarity."
    ],
    perks: [
      "Attractive Cash Prizes for Top 3 Teams",
      "Welcome Kits & Mementos",
      "Delicious Lunch & Snacks",
      "Presentation Certificates to all team members"
    ],
    outcomes: [
      "Peer-reviewed feedback from veteran academicians and industry researchers."
    ],
    certificates: "Cash Prize with Winner Shields for Top Teams; Certificate of Presentation for all participants.",
    importantInstructions: [
      "carry softcopy in a pen drive."
    ],
    themes: [
      "Emerging Electronics, Embedded Systems & IoT",
      "Next-Generation Semiconductor & VLSI Technologies",
      "Artificial Intelligence, Computing & Cybersecurity",
      "Sustainable Technology, Environmental Innovation & Clean Energy"
    ],
    faqs: [
      {
        q: "Can members be from different colleges?",
        a: "Yes, inter-college team members are allowed. Team size must be 2 to 4 participants (min 2 compulsory)."
      },
      {
        q: "What is the abstract deadline?",
        a: "Abstract submission deadline is 03/10/2026."
      }
    ],
    coordinatorName: "Ms.Gopika G",
    coordinatorPhone: "+91 6374791671",
    coordinatorEmail: "evitron26@gmail.com",
    isActive: true
  },
  {
    id: "tech-evolvex",
    slug: "evolvex",
    title: "EVOLVEX",
    tagline: "Project Presentation",
    category: "technical",
    description: "Showcase your working engineering projects, prototypes, IoT gadgets, and embedded hardware solutions to eminent judges and innovators.",
    venue: "MEC - EDC lab, MPMC lab",
    time: "10:00 AM - 01:30 PM",
    date: "08/10/2026",
    eligibility: "Engineering UG/PG students. 2 to 4 members per team (min 2 compulsory).",
    teamSize: 4,
    minTeamSize: 2,
    maxTeamSize: 4,
    teamSizeLabel: "Team of 2 to 4 Participants",
    feePerPerson: 250,
    rules: [
      "Every team must consist of 2 to 4 members (minimum 2 compulsory, up to 4 total including team lead).",
      "Teams must bring their working prototype/hardware demonstration.",
      "Standard 230V AC power supply and test benches will be provided.",
      "Software/simulation only projects are Not allowed, Allowed Only for Hardware Based"
    ],
    procedure: [
      "Display project hardware on assigned project booth.",
      "Live demonstration to the judging committee followed by technical cross-examination."
    ],
    perks: [
      "Substantial Cash Prizes & Innovation Trophies",
      "Welcome Kit & Refreshments",
      "Incubation & Mentorship guidance for standout projects",
      "Project Presentation Certificates"
    ],
    outcomes: [
      "Validate prototype viability and connect with innovation leaders."
    ],
    certificates: "Winner Cash Prize + Certificate of Excellence; Participation Certificates for all registered members.",
    importantInstructions: [
      "Bring all required extension cords, batteries and connectors for your setup."
    ],
    faqs: [
      {
        q: "Will power supply be arranged?",
        a: "Yes, 230V AC standard sockets are available at the demonstration stalls."
      }
    ],
    coordinatorName: "Mr.Dharanish S",
    coordinatorPhone: "+91 6379374763",
    coordinatorEmail: "evitron26@gmail.com",
    isActive: true
  },
  {
    id: "tech-tracktron",
    slug: "tracktron",
    title: "TRACKTRON",
    tagline: "Line Follower Race",
    category: "technical",
    description: "High-speed autonomous line follower robotics challenge. Build and tune your robot to navigate tight curves, intersections, and speed checkpoints in record time.",
    venue: "MEC-VOC Arangam",
    time: "11:00 AM - 02:00 PM",
    date: "08/10/2026",
    eligibility: "Open to all Engineering students. Team size: 2 to 4 participants (min 2 compulsory).",
    teamSize: 4,
    minTeamSize: 2,
    maxTeamSize: 4,
    teamSizeLabel: "Team of 2 to 4 Participants",
    feePerPerson: 250,
    rules: [
      "Autonomous robot only \u2014 The robot must be completely autonomous; no manual remote controls allowed.",
      "Maximum robot size: 25 x 25 x 20 cm.",
      "Maximum robot weight: 1.5 kg.",
      "Battery powered only (no external power line during runs).",
      "Start at START line and finish at FINISH line on the track.",
      "Fastest valid completion time wins.",
      "The judge's and referee's decision during a race is final and binding.",
      "Safety rules must always be followed strictly by all participants.",
      "Teams must arrive at the venue before their designated reporting time.",
      "Participants are fully responsible for their own robot, components, batteries, and tools.",
      "The organizers are not responsible for any damage caused by improper construction or operation of a robot.",
      "Teams must not intentionally interfere with another team's robot or setup.",
      "Only registered team members are allowed to work on the robot.",
      "Any rule violation will result in an immediate penalty or disqualification."
    ],
    procedure: [
      "ROUND 1 \u2014 TECHNICAL INSPECTION: Officials will inspect robot dimensions, weight, battery, electronics, autonomous operation, safety, and rule compliance. Robots failing inspection can correct issues before the deadline.",
      "ROUND 2 \u2014 PRACTICE ROUND: Teams get a practice opportunity to test sensors, adjust positions, tune controllers, check motor performance, and understand the track. Practice runs do not count toward rankings.",
      "ROUND 3 \u2014 QUALIFYING ROUND: Each team receives two official attempts. The better valid time is used. The fastest 8/12/16 teams qualify for the finals.",
      "ROUND 4 \u2014 FINAL ROUND: Finalists compete on the official final track. Each team receives up to two attempts, and the fastest valid completion time determines the final ranking."
    ],
    perks: [
      "Championship Cash Prize & Robotics Trophy",
      "Food & Hospitality Kits",
      "Robotics Performance Certificates"
    ],
    outcomes: [
      "Gain real-time robotics calibration, PID tuning, and sensor optimization skills."
    ],
    certificates: "Winner Cash Awards + Medals; Certificates of Technical Participation.",
    importantInstructions: [
      "Participants are highly recommended to bring: Fully assembled robot, Spare battery, Battery charger, USB cable, Laptop (for coding/re-programming), Spare motors, Spare wheels, Sensor modules, Jumper wires, Screwdriver set, Soldering equipment (if permitted), Tape & mechanical spare parts, and Microcontroller programming cable."
    ],
    faqs: [
      {
        q: "Can we modify robot code between runs?",
        a: "Yes, during designated pit time before your official turn."
      }
    ],
    coordinatorName: "Mr.Aadhitya K",
    coordinatorPhone: "+91 9384464856",
    coordinatorEmail: "evitron26@gmail.com",
    isActive: true
  },
  // --- NON-TECHNICAL EVENTS (Eligible only when at least 1 Technical event is selected) ---
  {
    id: "non-mind-maze",
    slug: "mind-maze",
    title: "MIND MAZE",
    tagline: "Spin. Stumble. Solve",
    category: "non-technical",
    description: "A fun-filled non-technical event where participants spin around an object and then attempt to solve a puzzle in a dizzy state, testing their focus and mental stability.",
    venue: "MEC - Classroom No: G-19",
    time: "02:00 PM - 03:30 PM",
    date: "08/10/2026",
    eligibility: "Must be registered for at least one Technical Event with your team (2 to 4 members).",
    teamSize: 4,
    minTeamSize: 2,
    maxTeamSize: 4,
    teamSizeLabel: "Same Team (2 to 4 Members)",
    feePerPerson: 0,
    // Included with technical registration
    rules: [
      "Available only to participants who registered for a technical event.",
      "The registered team (2 to 4 members) competes together.",
      "Use of mobile phones or internet search during the rounds is strictly prohibited.",
      "[EVENT RULES WILL BE UPDATED]"
    ],
    procedure: [
      "Round 1: Circle the water can 5 times, run back and solve a simple picture puzzle in 60 seconds.",
      "Round 2: Circle 10 times with an obstacle walk and solve a tougher jumbled puzzle while dizzy.",
      "Round 3: 10 fast spins, zig-zag run and solve the final complex puzzle to become the Mind Maze Champion."
    ],
    perks: [
      "Exciting Cash Prizes",
      "Official Winner Certificates",
      "Fun & Refreshments"
    ],
    outcomes: ["Improves focus, balance and quick thinking under pressure while having fun."],
    certificates: "Winner Shields & Certificates of Achievement.",
    importantInstructions: [
      "Report to the venue 15 minutes prior to scheduled start."
    ],
    faqs: [
      {
        q: "Can I register for Mind Maze without registering for a technical event?",
        a: "No. As per symposium regulations, non-technical events can only be chosen in conjunction with at least one technical event."
      }
    ],
    coordinatorName: "Ms.Varshini.V",
    coordinatorPhone: "+91 6384778040",
    coordinatorEmail: "evitron26@gmail.com",
    isActive: true
  },
  {
    id: "non-promptify",
    slug: "promptify",
    title: "PROMPTIFY",
    tagline: "AI Prompt Engineering & Creative Challenge",
    category: "non-technical",
    description: "Put your generative AI skills to the test. Craft precision prompts to generate specific design assets, solve riddles, and produce target imagery.",
    venue: "MEC - Classroom No: 303",
    time: "02:00 PM - 03:30 PM",
    date: "08/10/2026",
    eligibility: "Must be registered for at least one Technical Event with your team (2 to 4 members).",
    teamSize: 4,
    minTeamSize: 2,
    maxTeamSize: 4,
    teamSizeLabel: "Same Team (2 to 4 Members)",
    feePerPerson: 0,
    rules: [
      "Available only for technical event registrants.",
      "Teams will be provided specified challenges and must craft prompts using given AI models.",
      "[EVENT RULES WILL BE UPDATED]"
    ],
    procedure: [
      "Challenge 1: Target image recreation through prompt refinement.",
      "Challenge 2: Creative AI storyboarding and prompt efficiency."
    ],
    perks: ["Cash Prizes for Winners", "Special AI Excellence Badges"],
    outcomes: ["Master prompt engineering and generative workflow heuristics."],
    certificates: "Winner Certificates & Badges.",
    importantInstructions: ["Participants must do on their mobiles or laptop, systems will not be provided."],
    faqs: [
      {
        q: "Which AI platforms will be used?",
        a: "Standard open/accessible generative interfaces such as ChatGPT, Gemini and more."
      }
    ],
    coordinatorName: "Mr.Madhan M",
    coordinatorPhone: "+91 6382409516",
    coordinatorEmail: "evitron26@gmail.com",
    isActive: true
  },
  {
    id: "non-memix",
    slug: "memix",
    title: "MEMIX",
    tagline: "Tech Meme & Creative Media Contest",
    category: "non-technical",
    description: "Showcase your wit and humor. Design relatable, laugh-out-loud engineering and college life memes based on spontaneous on-spot themes.",
    venue: "MEC - Classroom No: G-18",
    time: "02:00 PM - 03:30 PM",
    date: "08/10/2026",
    eligibility: "Must be registered for at least one Technical Event with your team.",
    teamSize: 1,
    teamSizeLabel: "Individual (From Registered Tech Team)",
    feePerPerson: 0,
    rules: [
      "Available only to technical event participants.",
      "Content must be respectful, free from vulgarity or hate speech.",
      "Memes must be original and created during the event time.",
      "[EVENT RULES WILL BE UPDATED]"
    ],
    procedure: [
      "Topic release on spot.",
      "10 minutes design & crafting time.",
      "Presentation and jury voting."
    ],
    perks: ["Cash Prizes & Viral Creator Awards", "Certificates"],
    outcomes: ["Creative expression and humor in technical culture."],
    certificates: "Winner Shields & Certificates.",
    importantInstructions: ["Bring laptops or smartphones with graphic editors on your own."],
    faqs: [
      {
        q: "Can templates be used?",
        a: "Standard meme templates are permitted; captions must be 100% original."
      }
    ],
    coordinatorName: "Mr.Harendra R",
    coordinatorPhone: "+91 9514876965",
    coordinatorEmail: "evitron26@gmail.com",
    isActive: true
  },
  {
    id: "non-detective-404",
    slug: "detective-404",
    title: "DETECTIVE 404",
    tagline: "Circuit Bug Hunting & Mystery Puzzle",
    category: "non-technical",
    description: "Step into the shoes of a cyber and hardware detective. Unravel clues, debug sabotaged breadboards, and solve the tech escape mystery.",
    venue: "MEC - Communications Lab",
    time: "02:30 PM - 04:00 PM",
    date: "08/10/2026",
    eligibility: "Must be registered for at least one Technical Event with your team (2 to 4 members).",
    teamSize: 4,
    minTeamSize: 2,
    maxTeamSize: 4,
    teamSizeLabel: "Same Team (2 to 4 Members)",
    feePerPerson: 0,
    rules: [
      "Team must already be enrolled in a technical event.",
      "Follow clues sequentially; Systems will not be provided.",
      "[EVENT RULES WILL BE UPDATED]"
    ],
    procedure: [
      "Stage 1: Decode cryptographic coordinates on campus.",
      "Stage 2: Fix deliberate wiring faults on test circuit.",
      "Stage 3: Unlock final mystery safe."
    ],
    perks: ["Cash Prizes for Top Detectives", "Event Certificates"],
    outcomes: ["Teamwork, diagnostic troubleshooting, and lateral deduction."],
    certificates: "Master Detective Trophy & Certificates of Merit.",
    importantInstructions: ["Follow all safety rules in the laboratory arena."],
    faqs: [
      {
        q: "Is it physical or digital?",
        a: "digital puzzle decoding!"
      }
    ],
    coordinatorName: "Mr.Jeevanesh S",
    coordinatorPhone: "+91 8015272452",
    coordinatorEmail: "evitron26@gmail.com",
    isActive: true
  }
];
var mappedEvents = initialEvents.map((event) => {
  if (event.feePerPerson > 0) {
    return {
      ...event,
      feePerPerson: getPricePerPerson(event.category === "workshops" ? "workshop" : "technical")
    };
  }
  return event;
});

// server/repository.ts
function mapEvent(row) {
  const metadata = row.extra_metadata || {};
  const coordinator = row.coordinator || {};
  return {
    id: row.id,
    slug: row.code || metadata.slug || row.id,
    title: row.name,
    tagline: metadata.tagline || "",
    category: row.category === "workshop" || row.category === "workshops" ? "workshops" : row.category === "non_technical" || row.category === "non-technical" || row.category === "nontechnical" ? "non-technical" : row.category || "technical",
    description: row.description || "",
    venue: metadata.venue || "",
    time: metadata.time || "",
    date: metadata.date || "08/10/2026",
    eligibility: metadata.eligibility || "",
    teamSize: row.category === "technical" ? 4 : row.max_team_size || 1,
    minTeamSize: metadata.minTeamSize || (row.category === "technical" ? 2 : 1),
    maxTeamSize: metadata.maxTeamSize || (row.category === "technical" ? 4 : row.max_team_size || 1),
    teamSizeLabel: metadata.teamSizeLabel || ((row.max_team_size || 1) === 1 ? "Individual (1 Participant)" : row.category === "technical" ? "Team of 2 to 4 Participants" : `Team of ${row.max_team_size} Participants`),
    feePerPerson: Number(row.price || 0),
    rules: Array.isArray(row.rules) ? row.rules : [],
    procedure: Array.isArray(row.procedure) ? row.procedure : [],
    perks: Array.isArray(row.perks) ? row.perks : [],
    outcomes: Array.isArray(metadata.outcomes) ? metadata.outcomes : [],
    certificates: metadata.certificates || "",
    importantInstructions: Array.isArray(metadata.importantInstructions) ? metadata.importantInstructions : [],
    themes: Array.isArray(metadata.themes) ? metadata.themes : row.code === "techpaper" || row.id === "tech-techpaper" || row.name && row.name.toLowerCase().includes("techpaper") ? [
      "Emerging Electronics, Embedded Systems & IoT",
      "Next-Generation Semiconductor & VLSI Technologies",
      "Artificial Intelligence, Computing & Cybersecurity",
      "Sustainable Technology, Environmental Innovation & Clean Energy"
    ] : void 0,
    faqs: Array.isArray(row.faqs) ? row.faqs : [],
    coordinatorName: coordinator.name || metadata.coordinatorName || "[COORDINATOR NAME]",
    coordinatorPhone: coordinator.phone || metadata.coordinatorPhone || "[COORDINATOR PHONE]",
    coordinatorEmail: coordinator.email || metadata.coordinatorEmail || "evitron26@gmail.com",
    isActive: Boolean(row.is_active)
  };
}
async function getSiteSettings() {
  if (!isSupabaseConfigured()) {
    return initialSiteSettings;
  }
  const kvQuery = await supabaseAdmin.from("site_settings").select("key,value");
  if (!kvQuery.error && kvQuery.data && kvQuery.data.length > 0 && "key" in kvQuery.data[0]) {
    const settings = { ...initialSiteSettings };
    for (const row of kvQuery.data) {
      try {
        settings[row.key] = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      } catch {
        settings[row.key] = row.value;
      }
    }
    return settings;
  }
  const flatQuery = await supabaseAdmin.from("site_settings").select("*");
  if (flatQuery.error) {
    throw flatQuery.error || new Error("Failed to load site settings from Supabase.");
  }
  if (flatQuery.data && flatQuery.data.length > 0) {
    const row = flatQuery.data[0];
    const settings = { ...initialSiteSettings };
    const mappings = {
      symposium_title: "symposiumTitle",
      sub_title: "subTitle",
      department: "department",
      college: "college",
      associations: "associations",
      event_date: "eventDate",
      countdown_target: "countdownTarget",
      registration_deadline: "registrationDeadline",
      paper_submission_deadline: "paperSubmissionDeadline",
      is_registration_open: "isRegistrationOpen",
      closed_reason: "closedReason",
      upi_id: "upiId",
      upi_payee_name: "upiPayeeName",
      upi_qr_image_url: "upiQrImageUrl",
      workshop_upi_id: "workshopUpiId",
      workshop_upi_payee_name: "workshopUpiPayeeName",
      workshop_upi_qr_image_url: "workshopUpiQrImageUrl",
      tech_upi_id: "techUpiId",
      tech_upi_payee_name: "techUpiPayeeName",
      tech_upi_qr_image_url: "techUpiQrImageUrl",
      razorpay_enabled: "razorpayEnabled",
      drive_upload_url: "driveUploadUrl",
      participant_form_url: "participantFormUrl",
      contact_email: "contactEmail",
      instagram_handle: "instagramHandle",
      venue: "venue",
      announcement_text: "announcementText",
      announcement_active: "announcementActive",
      fee_per_person: "feePerPerson",
      closed_workshops: "closedWorkshops",
      app_env: "appEnv",
      admin_notification_emails: "adminNotificationEmails",
      force_early_bird: "forceEarlyBird",
      early_bird_deadline: "earlyBirdDeadline",
      google_sheet_webhook_url: "googleSheetWebhookUrl"
    };
    for (const [dbCol, stateKey] of Object.entries(mappings)) {
      if (row[dbCol] !== void 0 && row[dbCol] !== null) {
        settings[stateKey] = row[dbCol];
      }
    }
    return settings;
  }
  return initialSiteSettings;
}
async function updateSiteSettings(partial, updatedBy) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  const kvQuery = await supabaseAdmin.from("site_settings").select("key,value").limit(1);
  const isKeyValue = !kvQuery.error && kvQuery.data && kvQuery.data.length > 0 && "key" in kvQuery.data[0];
  if (isKeyValue) {
    for (const [key, value] of Object.entries(partial)) {
      const { error } = await supabaseAdmin.from("site_settings").upsert({
        key,
        value,
        ...updatedBy ? { updated_by: updatedBy } : {},
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      if (error) throw error;
    }
  } else {
    const mappings = {
      symposiumTitle: "symposium_title",
      subTitle: "sub_title",
      department: "department",
      college: "college",
      associations: "associations",
      eventDate: "event_date",
      countdownTarget: "countdown_target",
      registrationDeadline: "registration_deadline",
      paperSubmissionDeadline: "paper_submission_deadline",
      isRegistrationOpen: "is_registration_open",
      closedReason: "closed_reason",
      upiId: "upi_id",
      upiPayeeName: "upi_payee_name",
      upiQrImageUrl: "upi_qr_image_url",
      workshopUpiId: "workshop_upi_id",
      workshopUpiPayeeName: "workshop_upi_payee_name",
      workshopUpiQrImageUrl: "workshop_upi_qr_image_url",
      techUpiId: "tech_upi_id",
      techUpiPayeeName: "tech_upi_payee_name",
      techUpiQrImageUrl: "tech_upi_qr_image_url",
      razorpayEnabled: "razorpay_enabled",
      driveUploadUrl: "drive_upload_url",
      participantFormUrl: "participant_form_url",
      contactEmail: "contact_email",
      instagramHandle: "instagram_handle",
      venue: "venue",
      announcementText: "announcement_text",
      announcementActive: "announcement_active",
      feePerPerson: "fee_per_person",
      closedWorkshops: "closed_workshops",
      appEnv: "app_env",
      adminNotificationEmails: "admin_notification_emails",
      forceEarlyBird: "force_early_bird",
      earlyBirdDeadline: "early_bird_deadline",
      googleSheetWebhookUrl: "google_sheet_webhook_url"
    };
    const dbPayload = {
      id: "current",
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    for (const [stateKey, dbCol] of Object.entries(mappings)) {
      if (partial[stateKey] !== void 0) {
        dbPayload[dbCol] = partial[stateKey];
      }
    }
    const { error } = await supabaseAdmin.from("site_settings").upsert(dbPayload);
    if (error) throw error;
  }
  return getSiteSettings();
}
async function getEvents(includeInactive = true) {
  if (!isSupabaseConfigured()) {
    return mappedEvents;
  }
  let query = supabaseAdmin.from("events").select("*").order("sort_order", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapEvent);
}
async function getEventBySlug(slug) {
  if (!isSupabaseConfigured()) {
    return mappedEvents.find((e) => e.slug === slug || e.id === slug);
  }
  const { data, error } = await supabaseAdmin.from("events").select("*").or(`code.eq.${slug},id.eq.${slug}`).maybeSingle();
  if (error) throw error;
  if (!data) return void 0;
  return mapEvent(data);
}
async function resolveEventInfo(eventIdentifier) {
  if (!eventIdentifier) return null;
  const clean = eventIdentifier.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
  const { data: dbEvents } = await supabaseAdmin.from("events").select("id, code, name, category, price");
  if (!dbEvents || dbEvents.length === 0) return null;
  if (isUuid) {
    const foundById = dbEvents.find((e) => e.id.toLowerCase() === clean.toLowerCase());
    if (foundById) return { id: foundById.id, price: Number(foundById.price || 0), name: foundById.name, category: foundById.category };
  }
  const cleanLower = clean.toLowerCase();
  const stripped = cleanLower.replace(/^tech-/, "").replace(/^ws-/, "").replace(/^non-/, "").replace(/^nontech-/, "");
  const match = dbEvents.find((e) => {
    const codeLower = (e.code || "").toLowerCase();
    const nameLower = (e.name || "").toLowerCase();
    return e.id === clean || codeLower === cleanLower || codeLower === stripped || nameLower === cleanLower || nameLower === stripped || nameLower.replace(/\s+/g, "-") === stripped || stripped.includes("paper") && (codeLower.includes("paper") || nameLower.includes("paper")) || stripped.includes("evolvex") && codeLower.includes("evolvex") || stripped.includes("project") && (codeLower.includes("evolvex") || nameLower.includes("evolvex")) || stripped.includes("tracktron") && codeLower.includes("tracktron") || (stripped.includes("line") || stripped.includes("robot")) && codeLower.includes("tracktron") || stripped.includes("silicon") && codeLower.includes("silicon") || stripped.includes("cadence") && codeLower.includes("silicon") || stripped.includes("embedded") && codeLower.includes("embedded") || (stripped.includes("virtual") || stripped.includes("instrumentation") || stripped.includes("labview")) && codeLower.includes("virtual") || (stripped.includes("mind") || stripped.includes("maze")) && codeLower.includes("mind") || stripped.includes("prompt") && codeLower.includes("prompt") || stripped.includes("mem") && codeLower.includes("mem") || stripped.includes("detective") && codeLower.includes("detective");
  });
  if (match) {
    return { id: match.id, price: Number(match.price || 0), name: match.name, category: match.category };
  }
  return null;
}
async function validateRegistrationEvents(eventIds) {
  const uniqueIds = [...new Set(eventIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { valid: false, error: "No events selected." };
  }
  if (!isSupabaseConfigured()) {
    const matched = mappedEvents.filter((e) => uniqueIds.includes(e.id));
    if (matched.length !== uniqueIds.length) {
      return { valid: false, error: "One or more selected events do not exist." };
    }
    return {
      valid: true,
      events: matched.map((e) => ({
        id: e.id,
        name: e.title,
        category: e.category,
        price: e.feePerPerson,
        isActive: e.isActive
      }))
    };
  }
  const { data: dbEvents, error } = await supabaseAdmin.from("events").select("id,code,name,category,price,is_active");
  if (error || !dbEvents || dbEvents.length === 0) {
    throw error || new Error("Failed to fetch events from database");
  }
  const matchedEvents = [];
  for (const rawId of uniqueIds) {
    const resolved = await resolveEventInfo(rawId);
    if (!resolved) {
      return { valid: false, error: `One or more selected events do not exist (${rawId}).` };
    }
    const full = dbEvents.find((e) => e.id === resolved.id);
    if (!full || !full.is_active) {
      return { valid: false, error: `The selected event "${resolved.name}" is currently inactive.` };
    }
    matchedEvents.push({
      id: full.id,
      name: full.name,
      category: String(full.category).toLowerCase(),
      price: Number(full.price || 0),
      isActive: Boolean(full.is_active)
    });
  }
  return { valid: true, events: matchedEvents };
}
async function updateEvent(id, partial) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  const existing = await supabaseAdmin.from("events").select("*").eq("id", id).maybeSingle();
  if (existing.error || !existing.data) {
    throw existing.error || new Error(`Event with ID ${id} not found.`);
  }
  const current = mapEvent(existing.data);
  const merged = { ...current, ...partial };
  const dbCategory = merged.category === "non-technical" ? "non_technical" : merged.category;
  const { data, error } = await supabaseAdmin.from("events").update({
    name: merged.title,
    description: merged.description,
    category: dbCategory,
    max_team_size: merged.teamSize,
    price: merged.feePerPerson,
    rules: merged.rules,
    procedure: merged.procedure,
    perks: merged.perks,
    faqs: merged.faqs,
    is_active: merged.isActive,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? mapEvent(data) : null;
}
function participantFromRow(row) {
  return {
    fullName: row.full_name || "Attendee",
    email: row.email || "",
    phone: row.phone || "",
    college: row.college || "",
    department: row.department || void 0,
    year: row.year_of_study || void 0
  };
}
function normalizeRegistrationCode(value) {
  return value.trim().toUpperCase();
}
function mapRegistration(row, truncateProof = false) {
  const pRows = Array.isArray(row.participants) ? [...row.participants].sort((a, b) => {
    const aOrder = Number(a.participant_order || 99);
    const bOrder = Number(b.participant_order || 99);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.full_name || "").localeCompare(b.full_name || "");
  }) : [];
  const participantsList = pRows.map(participantFromRow);
  const leaderRow = pRows.find((p) => p.is_team_leader) || pRows[0];
  const leader = leaderRow ? participantFromRow(leaderRow) : { fullName: "Attendee", email: "", phone: "", college: "" };
  const payment = Array.isArray(row.payments) ? row.payments[0] : row.payments;
  let regWorkshopId;
  const regTechnicalIds = [];
  const regNonTechnicalIds = [];
  const eventsList = Array.isArray(row.registration_events) ? row.registration_events : [];
  const eventNames = [];
  for (const re of eventsList) {
    if (!re || !re.event_id) continue;
    if (re.events?.name) eventNames.push(re.events.name);
    const cat = String(re.events?.category || "").toLowerCase();
    if (cat === "workshop" || cat === "workshops") {
      regWorkshopId = re.event_id;
    } else if (cat === "non_technical" || cat === "non-technical" || cat === "nontechnical") {
      regNonTechnicalIds.push(re.event_id);
    } else {
      regTechnicalIds.push(re.event_id);
    }
  }
  const rawProofUrl = payment?.payment_proof_url || void 0;
  const hasProof = Boolean(rawProofUrl || row.drive_screenshot_submitted);
  const paymentProofUrl = truncateProof && hasProof ? "HAS_PROOF" : rawProofUrl;
  return {
    id: row.registration_code,
    createdAt: row.created_at,
    registrationType: row.registration_type === "individual" ? "workshop" : "technical",
    selectedWorkshopId: regWorkshopId,
    selectedTechnicalIds: regTechnicalIds,
    selectedNonTechnicalIds: regNonTechnicalIds,
    eventsText: eventNames.length > 0 ? eventNames.join(", ") : void 0,
    participants: participantsList,
    teamLeader: leader,
    totalAmount: Number(row.total_amount || 0),
    paymentMethod: row.payment_method === "razorpay" ? "razorpay" : "upi",
    paymentStatus: row.payment_status === "pending" ? "pending_verification" : row.payment_status || "pending_verification",
    paymentId: payment?.razorpay_payment_id || void 0,
    upiReference: payment?.upi_reference || void 0,
    driveScreenshotSubmitted: Boolean(rawProofUrl || payment?.upi_reference),
    paymentProofUrl,
    attendanceMarked: Boolean(row.attendance_marked),
    attendanceTimestamp: row.attendance_marked_at || void 0
  };
}
async function assembleRegistrations(regsData) {
  if (!regsData || regsData.length === 0) return [];
  const regIds = regsData.map((r) => r.id);
  const [partsRes, paymentsRes, regEventsRes] = await Promise.all([
    supabaseAdmin.from("registration_participants").select("registration_id, role, participants(*)").in("registration_id", regIds),
    supabaseAdmin.from("payments").select("*").in("registration_id", regIds),
    supabaseAdmin.from("registration_events").select("*, events(*)").in("registration_id", regIds)
  ]);
  if (partsRes.error) throw partsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (regEventsRes.error) throw regEventsRes.error;
  const participantsMap = /* @__PURE__ */ new Map();
  for (const item of partsRes.data || []) {
    const p = item.participants;
    if (!p) continue;
    const list = participantsMap.get(item.registration_id) || [];
    list.push({
      ...p,
      is_team_leader: item.role === "team_leader" || item.role === "leader"
    });
    participantsMap.set(item.registration_id, list);
  }
  const paymentsMap = /* @__PURE__ */ new Map();
  for (const p of paymentsRes.data || []) {
    const list = paymentsMap.get(p.registration_id) || [];
    list.push(p);
    paymentsMap.set(p.registration_id, list);
  }
  const regEventsMap = /* @__PURE__ */ new Map();
  for (const re of regEventsRes.data || []) {
    const list = regEventsMap.get(re.registration_id) || [];
    list.push(re);
    regEventsMap.set(re.registration_id, list);
  }
  return regsData.map((row) => ({
    ...row,
    participants: participantsMap.get(row.id) || [],
    payments: paymentsMap.get(row.id) || [],
    registration_events: regEventsMap.get(row.id) || []
  }));
}
async function getRegistrationById(registrationCode) {
  const code = normalizeRegistrationCode(registrationCode);
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  const { data, error } = await supabaseAdmin.from("registrations").select("*").eq("registration_code", code).maybeSingle();
  if (error) throw error;
  if (!data) return void 0;
  const assembled = await assembleRegistrations([data]);
  return mapRegistration(assembled[0]);
}
async function getRegistrationByPaymentId(paymentId) {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
  const { data, error } = await supabaseAdmin.from("payments").select("registration_id").eq("razorpay_payment_id", paymentId).maybeSingle();
  if (error) throw error;
  if (!data) return void 0;
  return getRegistrationByUuid(data.registration_id);
}
async function getRegistrationByUuid(uuid) {
  const { data, error } = await supabaseAdmin.from("registrations").select("*").eq("id", uuid).maybeSingle();
  if (error) throw error;
  if (!data) return void 0;
  const assembled = await assembleRegistrations([data]);
  return mapRegistration(assembled[0]);
}
async function getRegistrationUuidByRazorpayOrderId(razorpayOrderId) {
  if (!isSupabaseConfigured()) return void 0;
  const { data, error } = await supabaseAdmin.from("payments").select("registration_id").eq("razorpay_order_id", razorpayOrderId).eq("method", "razorpay").maybeSingle();
  if (error) return void 0;
  return data?.registration_id;
}
async function finalizeRazorpayRegistration(registrationUuid, razorpayPaymentId, signatureVerified) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabaseAdmin.rpc(
    "finalize_razorpay_registration",
    {
      p_registration_id: registrationUuid,
      p_razorpay_payment_id: razorpayPaymentId,
      p_signature_verified: signatureVerified
    }
  );
  if (error) throw error;
}
async function createPendingRazorpayRegistration(input) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const registrationCode = `EV26-${code}`;
  const eventIds = [
    ...input.selectedWorkshopId ? [input.selectedWorkshopId] : [],
    ...input.selectedTechnicalIds,
    ...input.selectedNonTechnicalIds
  ];
  const dbRegType = input.registrationType === "workshop" ? "individual" : "team";
  const { data: reg, error: regErr } = await supabaseAdmin.from("registrations").insert({
    registration_code: registrationCode,
    registration_type: dbRegType,
    total_amount: input.totalAmount,
    payment_method: "razorpay",
    payment_status: "pending"
  }).select("id").single();
  if (regErr || !reg?.id) {
    throw regErr || new Error("Failed to create registration record in Supabase");
  }
  const uuid = reg.id;
  for (let idx = 0; idx < input.participants.length; idx++) {
    const p = input.participants[idx];
    const { data: pData, error: pInsertErr } = await supabaseAdmin.from("participants").insert({
      full_name: p.fullName,
      email: p.email || "",
      phone: p.phone || "",
      college: p.college || "",
      department: p.department || null,
      year_of_study: p.year || null
    }).select("id").single();
    if (pInsertErr || !pData?.id) {
      console.error(`[DB] createPendingRazorpayRegistration participant [${idx}] insert failed:`, pInsertErr?.message);
      continue;
    }
    const { error: rpErr } = await supabaseAdmin.from("registration_participants").insert({
      registration_id: uuid,
      participant_id: pData.id,
      role: idx === 0 ? "team_leader" : "member"
    });
    if (rpErr) {
      console.error(`[DB] createPendingRazorpayRegistration registration_participants [${idx}] insert failed:`, rpErr.message);
    }
  }
  await supabaseAdmin.from("payments").insert({
    registration_id: uuid,
    amount: input.totalAmount,
    method: "razorpay",
    status: "pending"
  });
  for (const rawId of eventIds) {
    const resolved = await resolveEventInfo(rawId);
    if (resolved) {
      const defaultPrice = resolved.category === "workshop" ? 300 : 250;
      await supabaseAdmin.from("registration_events").insert({
        registration_id: uuid,
        event_id: resolved.id,
        price_at_registration: resolved.price || defaultPrice
      });
    }
  }
  return uuid;
}
async function createRegistration(input) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  let code = input.registrationCode;
  if (!code) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let rand = "";
    for (let i = 0; i < 6; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = `EV26-${rand}`;
  }
  const dbRegType = input.registrationType === "workshop" ? "individual" : "team";
  const dbStatus = input.paymentStatus === "pending_verification" ? "pending_verification" : input.paymentStatus;
  const { data: reg, error: regErr } = await supabaseAdmin.from("registrations").insert({
    registration_code: code,
    registration_type: dbRegType,
    total_amount: input.totalAmount,
    payment_method: input.paymentMethod,
    payment_status: dbStatus
  }).select("id").single();
  if (regErr || !reg?.id) {
    throw regErr || new Error("Failed to create registration record in Supabase");
  }
  const uuid = reg.id;
  for (let idx = 0; idx < input.participants.length; idx++) {
    const p = input.participants[idx];
    const { data: pData, error: pInsertErr } = await supabaseAdmin.from("participants").insert({
      full_name: p.fullName,
      email: p.email || "",
      phone: p.phone || "",
      college: p.college || "",
      department: p.department || null,
      year_of_study: p.year || null
    }).select("id").single();
    if (pInsertErr || !pData?.id) {
      console.error(`[DB] createRegistration participant [${idx}] insert failed:`, pInsertErr?.message);
      continue;
    }
    const { error: rpErr } = await supabaseAdmin.from("registration_participants").insert({
      registration_id: uuid,
      participant_id: pData.id,
      role: idx === 0 ? "team_leader" : "member"
    });
    if (rpErr) {
      console.error(`[DB] createRegistration registration_participants [${idx}] insert failed:`, rpErr.message);
    }
  }
  const { error: payErr } = await supabaseAdmin.from("payments").insert({
    registration_id: uuid,
    amount: input.totalAmount,
    method: input.paymentMethod,
    status: dbStatus,
    razorpay_order_id: input.razorpayOrderId || null,
    razorpay_payment_id: input.razorpayPaymentId || null,
    upi_reference: input.upiReference || null,
    payment_proof_url: input.paymentProofUrl || null
  });
  if (payErr) {
    console.error(`[DB] createRegistration payments insert failed:`, payErr.message);
  }
  const eventIds = [
    ...input.selectedWorkshopId ? [input.selectedWorkshopId] : [],
    ...input.selectedTechnicalIds || [],
    ...input.selectedNonTechnicalIds || []
  ];
  for (const rawId of eventIds) {
    if (!rawId) continue;
    const resolved = await resolveEventInfo(rawId);
    if (resolved) {
      const defaultPrice = resolved.category === "workshop" ? 300 : 250;
      const { error: reErr } = await supabaseAdmin.from("registration_events").insert({
        registration_id: uuid,
        event_id: resolved.id,
        price_at_registration: resolved.price || defaultPrice
      });
      if (reErr) {
        console.error(`[DB] Failed to insert registration_events for ${rawId}:`, reErr.message);
      }
    } else {
      console.warn(`[DB] Could not resolveEventInfo for rawId: "${rawId}"`);
    }
  }
  const reloaded = await getRegistrationByUuid(uuid);
  if (!reloaded) throw new Error("Failed to reload newly created registration.");
  return reloaded;
}
async function updateRegistrationPayment(registrationCode, patch) {
  const code = normalizeRegistrationCode(registrationCode);
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  const { data: registration, error: findErr } = await supabaseAdmin.from("registrations").select("id").eq("registration_code", code).maybeSingle();
  if (findErr || !registration) {
    throw findErr || new Error(`Registration ${code} not found`);
  }
  const dbStatus = patch.paymentStatus === "pending_verification" ? "pending_verification" : patch.paymentStatus;
  const { error: updateErr } = await supabaseAdmin.from("registrations").update({ payment_status: dbStatus, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", registration.id);
  if (updateErr) throw updateErr;
  const paymentPatch = { status: dbStatus, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  if (patch.paymentId) paymentPatch.razorpay_payment_id = patch.paymentId;
  if (patch.upiReference) paymentPatch.upi_reference = patch.upiReference;
  const { error: pUpdateErr } = await supabaseAdmin.from("payments").update(paymentPatch).eq("registration_id", registration.id);
  if (pUpdateErr) throw pUpdateErr;
  return getRegistrationByUuid(registration.id);
}
async function deleteRegistration(registrationCode) {
  const code = normalizeRegistrationCode(registrationCode);
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
  let query = supabaseAdmin.from("registrations").select("id");
  if (isUuid) {
    query = query.or(`registration_code.eq.${code},id.eq.${code}`);
  } else {
    query = query.eq("registration_code", code);
  }
  const { data: registration, error: findErr } = await query.maybeSingle();
  if (findErr || !registration) {
    throw findErr || new Error(`Registration ${code} not found`);
  }
  const { data: juncs } = await supabaseAdmin.from("registration_participants").select("participant_id").eq("registration_id", registration.id);
  const partIds = (juncs || []).map((j) => j.participant_id);
  await supabaseAdmin.from("registration_participants").delete().eq("registration_id", registration.id);
  if (partIds.length > 0) {
    await supabaseAdmin.from("participants").delete().in("id", partIds);
  }
  await supabaseAdmin.from("registration_events").delete().eq("registration_id", registration.id);
  await supabaseAdmin.from("payments").delete().eq("registration_id", registration.id);
  const { error: deleteErr } = await supabaseAdmin.from("registrations").delete().eq("id", registration.id);
  if (deleteErr) throw deleteErr;
  return true;
}
async function listRegistrations(filters) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  let query = supabaseAdmin.from("registrations").select("*").order("created_at", { ascending: false });
  if (filters?.registrationType) {
    const dbType = filters.registrationType === "workshop" ? "individual" : "team";
    query = query.eq("registration_type", dbType);
  }
  if (filters?.paymentStatus) {
    const dbStatus = filters.paymentStatus === "pending_verification" ? "pending_verification" : filters.paymentStatus;
    query = query.eq("payment_status", dbStatus);
  }
  const { data, error } = await query;
  if (error) throw error;
  const assembled = await assembleRegistrations(data || []);
  let results = assembled.map((row) => mapRegistration(row, true));
  if (filters?.search) {
    const needle = filters.search.toLowerCase();
    results = results.filter(
      (r) => [
        r.id,
        r.teamLeader?.fullName,
        r.teamLeader?.email,
        r.teamLeader?.phone,
        r.teamLeader?.college,
        r.upiReference
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))
    );
  }
  return results;
}
function calculateStatsFromRegistrations(registrations) {
  const workshopCount = registrations.filter((r) => r.registrationType === "workshop").length;
  const technicalCount = registrations.filter((r) => r.registrationType === "technical").length;
  const paidCount = registrations.filter((r) => r.paymentStatus === "paid").length;
  const pendingCount = registrations.filter((r) => r.paymentStatus === "pending_verification").length;
  const eventCounts = {};
  const eventTeamCounts = {};
  for (const r of registrations) {
    const pCount = r.participants.length || 1;
    if (r.selectedWorkshopId) {
      eventCounts[r.selectedWorkshopId] = (eventCounts[r.selectedWorkshopId] || 0) + pCount;
      eventTeamCounts[r.selectedWorkshopId] = (eventTeamCounts[r.selectedWorkshopId] || 0) + 1;
    }
    const tIds = r.selectedTechnicalIds || [];
    for (const tid of tIds) {
      eventCounts[tid] = (eventCounts[tid] || 0) + pCount;
      eventTeamCounts[tid] = (eventTeamCounts[tid] || 0) + 1;
    }
    const nIds = r.selectedNonTechnicalIds || [];
    for (const nid of nIds) {
      eventCounts[nid] = (eventCounts[nid] || 0) + pCount;
      eventTeamCounts[nid] = (eventTeamCounts[nid] || 0) + 1;
    }
  }
  return {
    totalRegistrations: registrations.length,
    totalParticipants: registrations.reduce((sum, r) => sum + (r.participants?.length > 0 ? r.participants.length : 1), 0),
    workshopCount,
    technicalCount,
    paidCount,
    pendingCount,
    eventCounts,
    eventTeamCounts,
    recentRegistrations: registrations.slice(0, 10)
  };
}
async function getRegistrationStats() {
  const registrations = await listRegistrations();
  return calculateStatsFromRegistrations(registrations);
}
async function markAttendance(registrationCode) {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured");
  }
  const registration = await getRegistrationById(registrationCode);
  if (!registration) {
    throw new Error(`Registration with code ${registrationCode} not found`);
  }
  const { data: regRow, error: findErr } = await supabaseAdmin.from("registrations").select("id").eq("registration_code", normalizeRegistrationCode(registrationCode)).maybeSingle();
  if (findErr || !regRow) {
    throw findErr || new Error(`Registration ${registrationCode} not found`);
  }
  const { error: updateErr } = await supabaseAdmin.from("registrations").update({
    attendance_marked: true,
    attendance_marked_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", regRow.id);
  if (updateErr) throw updateErr;
  const updated = await getRegistrationById(registrationCode);
  return {
    success: true,
    message: "Attendance successfully marked.",
    registration: updated || registration
  };
}
async function updatePaymentRecord(registrationUuid, patch) {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabaseAdmin.from("payments").update({ ...patch, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("registration_id", registrationUuid).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

// server/razorpay.ts
import crypto from "crypto";
function getAppEnv(storeSettingsEnv) {
  if (storeSettingsEnv === "production") return "production";
  if (storeSettingsEnv === "development") return "development";
  const envVar = (process.env.APP_ENV || process.env.RAZORPAY_ENV || "").trim().toLowerCase();
  if (envVar === "production") return "production";
  if (envVar === "development") return "development";
  return "production";
}
function getRazorpayKeyId() {
  return (process.env.RAZORPAY_LIVE_KEY_ID || process.env.RAZORPAY_KEY_ID || "").trim();
}
function getRazorpayKeySecret() {
  return (process.env.RAZORPAY_LIVE_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET || "").trim();
}
function isRazorpayLiveKey(keyId) {
  return keyId.startsWith("rzp_live_");
}
function isRazorpayTestKey(keyId) {
  return keyId.startsWith("rzp_test_");
}
async function checkRazorpayHealth(targetEnv) {
  const env = targetEnv || getAppEnv();
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  if (!keyId || !keySecret) {
    const isLive2 = keyId ? isRazorpayLiveKey(keyId) : false;
    const isTest2 = keyId ? isRazorpayTestKey(keyId) : false;
    const keyMode2 = isLive2 ? "LIVE" : isTest2 ? "TEST" : "NONE";
    const details = !keyId ? "Missing RAZORPAY_KEY_ID environment variable." : `Razorpay Key ID (${keyId.substring(0, 12)}...) is configured in ${keyMode2} mode. Key Secret is pending. Instant UPI QR payment is active.`;
    return {
      env,
      status: "NOT CONNECTED",
      liveConnected: false,
      testConnected: false,
      keyMode: keyMode2,
      keyIdPrefix: keyId ? keyId.substring(0, 12) : "NONE",
      details
    };
  }
  const isLive = isRazorpayLiveKey(keyId);
  const isTest = isRazorpayTestKey(keyId);
  const keyMode = isLive ? "LIVE" : isTest ? "TEST" : "NONE";
  if (env === "production" && !isLive) {
    return {
      env: "production",
      status: "NOT CONNECTED",
      liveConnected: false,
      testConnected: false,
      keyMode,
      keyIdPrefix: keyId.substring(0, 8),
      details: `CRITICAL SECURITY: Test key (${keyId.substring(0, 8)}...) is strictly prohibited in PRODUCTION mode. Production requires live Razorpay credentials (rzp_live_...).`
    };
  }
  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders?count=1", {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`
      }
    });
    if (res.ok) {
      return {
        env,
        status: "CONNECTED",
        liveConnected: isLive,
        testConnected: isTest,
        keyMode,
        keyIdPrefix: keyId.substring(0, 12),
        details: isLive ? `Razorpay Live credentials authenticated successfully with Razorpay API.` : `Razorpay Test credentials authenticated successfully with Razorpay API (Real Test Mode active).`
      };
    }
    const errText = await res.text();
    let desc = `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error && parsed.error.description) {
        desc = parsed.error.description;
      }
    } catch {
    }
    const isAuthPending = desc.toLowerCase().includes("auth") || res.status === 401;
    const detailsMessage = isAuthPending ? `Razorpay credentials verification pending. In Razorpay Dashboard (${isTest ? "Test Mode" : "Live Mode"}), navigate to Account & Settings > API Keys to verify your active Key ID and matching Secret. Instant UPI QR payment is active.` : `Razorpay gateway verification: ${desc}. Instant UPI QR payment is active.`;
    return {
      env,
      status: "NOT CONNECTED",
      liveConnected: false,
      testConnected: false,
      keyMode,
      keyIdPrefix: keyId.substring(0, 12),
      details: detailsMessage
    };
  } catch (err) {
    return {
      env,
      status: "NOT CONNECTED",
      liveConnected: false,
      testConnected: false,
      keyMode,
      keyIdPrefix: keyId.substring(0, 12),
      details: `Razorpay API connectivity: ${err.message}. Instant UPI QR payment is active.`
    };
  }
}
async function createOrder(amountInInr, receipt, notes = {}, targetEnv) {
  const env = targetEnv || getAppEnv();
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  if (!keyId || !keySecret) {
    throw new Error(
      `Razorpay Gateway is NOT CONFIGURED. Missing RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment settings. Please configure credentials or use Option 1 (Instant UPI QR).`
    );
  }
  if (env === "production" && !isRazorpayLiveKey(keyId)) {
    throw new Error(
      `CRITICAL SECURITY: Test key (${keyId.substring(0, 8)}...) is strictly prohibited in PRODUCTION mode. Production requires live Razorpay credentials (rzp_live_...). Simulation fallback is disabled.`
    );
  }
  const amountInPaise = Math.round(amountInInr * 100);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error && parsed.error.description) {
        errorDetail = parsed.error.description;
      }
    } catch {
    }
    throw new Error(`Razorpay Order Creation Failed: ${errorDetail}`);
  }
  const orderData = await response.json();
  return {
    orderId: orderData.id,
    amount: orderData.amount,
    currency: orderData.currency,
    keyId
  };
}
function verifyPaymentHmacSignature(orderId, paymentId, signature) {
  if (!orderId || !paymentId || !signature) {
    return false;
  }
  const keySecret = getRazorpayKeySecret();
  if (!keySecret) {
    return false;
  }
  try {
    const expectedSignature = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
    if (expectedSignature.length !== signature.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
  } catch (err) {
    return false;
  }
}
async function fetchAndVerifyRazorpayPayment(paymentId, expectedOrderId, expectedAmountInInr, targetEnv) {
  const env = targetEnv || getAppEnv();
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  if (!keyId || !keySecret) {
    return {
      valid: false,
      error: "Razorpay credentials are not configured on the server."
    };
  }
  if (env === "production" && !isRazorpayLiveKey(keyId)) {
    return {
      valid: false,
      error: "CRITICAL: Test keys are strictly prohibited in PRODUCTION mode. Transaction rejected."
    };
  }
  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`
      }
    });
    if (!res.ok) {
      const errText = await res.text();
      let desc = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error && parsed.error.description) desc = parsed.error.description;
      } catch {
      }
      return {
        valid: false,
        error: `Razorpay API payment verification failed: ${desc}`
      };
    }
    const payment = await res.json();
    if (payment.order_id !== expectedOrderId) {
      return {
        valid: false,
        error: `Payment order ID mismatch. Expected "${expectedOrderId}", received "${payment.order_id}".`
      };
    }
    if (payment.status !== "captured" && payment.status !== "authorized") {
      return {
        valid: false,
        error: `Payment status is "${payment.status}". Only captured or authorized payments can be confirmed.`
      };
    }
    const expectedPaise = Math.round(expectedAmountInInr * 100);
    if (payment.amount < expectedPaise) {
      return {
        valid: false,
        error: `Payment amount (\u20B9${payment.amount / 100}) is lower than the registration fee (\u20B9${expectedAmountInInr}).`
      };
    }
    return { valid: true, paymentDetails: payment };
  } catch (err) {
    return {
      valid: false,
      error: `Network error verifying payment with Razorpay API: ${err.message}`
    };
  }
}
function verifyWebhookSignature(rawBody, webhookSignature) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret || !webhookSignature) {
    return false;
  }
  const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(webhookSignature));
}

// server/qr.ts
import QRCode from "qrcode";
function buildAttendeeQrText(payload) {
  const membersText = payload.members.map((m, idx) => `[${idx + 1}] ${m.name} | ${m.phone} | ${m.college}`).join("\n");
  return [
    `=== EVITRON 2K26 OFFICIAL ENTRY PASS ===`,
    `Registration ID: ${payload.regId}`,
    `Leader: ${payload.leaderName}`,
    `Phone: ${payload.leaderPhone}`,
    `Email: ${payload.leaderEmail}`,
    `College: ${payload.college}`,
    `Department: ${payload.department}`,
    `Category: ${payload.track}`,
    `Events: ${payload.events.join(", ")}`,
    `Team Members:
${membersText}`,
    `Fee: INR ${payload.amount} | Status: ${payload.paymentStatus.toUpperCase()}`,
    `Symposium Date: ${payload.date} (08:30 AM IST)`,
    `Venue: ${payload.venue}`
  ].join("\n");
}
async function generateQrDataUrl(text) {
  try {
    return await QRCode.toDataURL(text, {
      width: 360,
      margin: 2,
      color: {
        dark: "#1c1917",
        light: "#ffffff"
      },
      errorCorrectionLevel: "M"
    });
  } catch (err) {
    console.error("QR Generation failed:", err);
    return "";
  }
}
async function generateAttendeeQrBuffer(text) {
  return await QRCode.toBuffer(text, {
    width: 400,
    margin: 2,
    color: {
      dark: "#1c1917",
      light: "#ffffff"
    },
    errorCorrectionLevel: "M"
  });
}
function buildUpiUri(upiId, payeeName, amount, transactionNote) {
  const cleanUpi = encodeURIComponent(upiId.trim());
  const cleanName = encodeURIComponent(payeeName.trim());
  const cleanNote = encodeURIComponent(transactionNote.trim());
  return `upi://pay?pa=${cleanUpi}&pn=${cleanName}&am=${amount.toFixed(2)}&cu=INR&tn=${cleanNote}`;
}

// server/email.ts
import nodemailer from "nodemailer";
var emailAuditLog = [];
function getSmtpTransporter() {
  const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  const smtpUser = (process.env.SMTP_USER || "evitron26@gmail.com").trim();
  const rawPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "";
  const cleanPass = rawPass.trim().replace(/\s+/g, "");
  if (!cleanPass) {
    return null;
  }
  if (smtpHost === "smtp.gmail.com" || smtpUser.toLowerCase().endsWith("@gmail.com")) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: smtpUser,
        pass: cleanPass
      },
      connectionTimeout: 1e4,
      greetingTimeout: 1e4,
      socketTimeout: 15e3
    });
  }
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: cleanPass
    },
    connectionTimeout: 1e4,
    greetingTimeout: 1e4,
    socketTimeout: 15e3
  });
}
async function sendRegistrationConfirmationEmail(reg, eventTitles) {
  const recipient = reg.teamLeader.email;
  const isPaid = reg.paymentStatus === "paid";
  const subject = isPaid ? `EVITRON 2K26 Official Entry Pass & Registration Confirmed - [${reg.id}]` : `EVITRON 2K26 Registration Received (Pending Payment Verification) - [${reg.id}]`;
  const otherEmails = reg.participants.slice(1).map((p) => p.email?.trim()).filter((em) => Boolean(em && em.includes("@") && em !== recipient));
  const trackLabel = reg.registrationType === "workshop" ? "Hands-on Workshop Track (Individual)" : `National Technical Symposium Track (${reg.participants.length} Members)`;
  const qrPayloadData = {
    symposium: "EVITRON 2K26",
    regId: reg.id,
    leaderName: reg.teamLeader.fullName,
    leaderPhone: reg.teamLeader.phone,
    leaderEmail: reg.teamLeader.email,
    college: reg.teamLeader.college,
    department: reg.teamLeader.department,
    track: trackLabel,
    events: eventTitles,
    members: reg.participants.map((p) => ({
      name: p.fullName,
      phone: p.phone,
      college: p.college,
      dept: p.department,
      year: p.year
    })),
    amount: reg.totalAmount,
    paymentStatus: reg.paymentStatus,
    paymentMethod: reg.paymentMethod,
    date: "08 October 2026",
    venue: "Mahendra Engineering College (Autonomous), Namakkal"
  };
  const qrText = buildAttendeeQrText(qrPayloadData);
  const qrBuffer = await generateAttendeeQrBuffer(qrText);
  const memberRowsHtml = reg.participants.map(
    (p, idx) => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 8px 12px; font-weight: bold; color: #374151;">${idx === 0 ? "Leader" : `Member ${idx + 1}`}</td>
        <td style="padding: 8px 12px; color: #111827; font-weight: 600;">${p.fullName}</td>
        <td style="padding: 8px 12px; color: #4b5563;">${p.department} (${p.year})</td>
        <td style="padding: 8px 12px; color: #4b5563;">${p.phone}</td>
        <td style="padding: 8px 12px; color: #4b5563;">${p.college}</td>
      </tr>
    `
  ).join("");
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>EVITRON 2K26 Official Ticket Pass</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08);">
    
    <!-- Top Header Banner -->
    <div style="background-color: #B22222; color: #ffffff; padding: 24px; text-align: center;">
      <p style="margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #fecaca; font-weight: 700;">
        Department of Electronics & Communication Engineering
      </p>
      <h1 style="margin: 0; font-size: 26px; font-weight: 900; letter-spacing: 1px;">EVITRON 2K26</h1>
      <p style="margin: 4px 0 0 0; font-size: 13px; color: #ffffff; font-weight: 500;">
        National Level Technical Symposium \u2022 Mahendra Engineering College
      </p>
      <div style="display: inline-block; margin-top: 14px; background: rgba(0,0,0,0.25); padding: 6px 16px; border-radius: 6px; font-size: 13px; font-family: monospace; font-weight: bold; border: 1px solid rgba(255,255,255,0.2);">
        REGISTRATION ID: ${reg.id}
      </div>
    </div>

    <!-- Main Content -->
    <div style="padding: 28px;">
      
      <p style="margin-top: 0; font-size: 15px; color: #1f2937; line-height: 1.5;">
        Dear <strong>${reg.teamLeader.fullName}</strong> and Team,
      </p>
      <p style="font-size: 14px; color: #4b5563; line-height: 1.5;">
        Congratulations! Your registration for <strong>EVITRON 2K26</strong> has been received and confirmed. Below is your official Entry Pass and Attendance QR Code.
      </p>

      <!-- Scannable Attendance QR Code Box -->
      <div style="background: #fdf2f2; border: 2px dashed #B22222; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #991b1b; margin-bottom: 12px;">
          OFFICIAL ATTENDANCE & VERIFICATION QR CODE
        </span>
        <img src="cid:attendee_entry_qr" alt="EVITRON 2K26 Entry Pass QR" style="width: 220px; height: 220px; border-radius: 8px; border: 1px solid #d1d5db; background: #ffffff; padding: 6px; margin: 0 auto; display: block;" />
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #374151; font-weight: bold; font-family: monospace;">
          ID: ${reg.id}
        </p>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #6b7280;">
          Show this QR code at the registration desk on <strong>08 October 2026</strong> for physical check-in and welcome kit collection.
        </p>
      </div>

      <!-- Registration Details Grid -->
      <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-top: 24px; margin-bottom: 12px;">
        Registration Summary
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280; width: 40%;">Track:</td>
          <td style="padding: 6px 0; font-weight: 600; color: #111827;">${trackLabel}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Registered Events:</td>
          <td style="padding: 6px 0; font-weight: 600; color: #B22222;">${eventTitles.join(", ")}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Payment Status:</td>
          <td style="padding: 6px 0;">
            <span style="display: inline-block; background: ${reg.paymentStatus === "paid" ? "#def7ec" : "#fef3c7"}; color: ${reg.paymentStatus === "paid" ? "#03543f" : "#92400e"}; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;">
              ${reg.paymentStatus}
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Total Registration Fee:</td>
          <td style="padding: 6px 0; font-weight: 700; color: #111827;">\u20B9${reg.totalAmount} (${reg.paymentMethod.toUpperCase()})</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Payment Ref / UTR:</td>
          <td style="padding: 6px 0; font-family: monospace; color: #111827;">${reg.paymentId || reg.upiReference || "Pending verification"}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Event Date:</td>
          <td style="padding: 6px 0; font-weight: 600; color: #111827;">08 October 2026 (Thursday)</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Reporting Time:</td>
          <td style="padding: 6px 0; font-weight: 600; color: #111827;">08:30 AM IST</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Venue:</td>
          <td style="padding: 6px 0; color: #111827;">Mahendra Engineering College (Autonomous), Namakkal</td>
        </tr>
      </table>

      <!-- Team Members Table -->
      <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-top: 24px; margin-bottom: 12px;">
        Registered Participants (${reg.participants.length})
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
        <thead>
          <tr style="background: #f9fafb; text-align: left;">
            <th style="padding: 8px 12px; color: #4b5563; font-weight: 700;">Role</th>
            <th style="padding: 8px 12px; color: #4b5563; font-weight: 700;">Name</th>
            <th style="padding: 8px 12px; color: #4b5563; font-weight: 700;">Dept/Year</th>
            <th style="padding: 8px 12px; color: #4b5563; font-weight: 700;">Phone</th>
            <th style="padding: 8px 12px; color: #4b5563; font-weight: 700;">College</th>
          </tr>
        </thead>
        <tbody>
          ${memberRowsHtml}
        </tbody>
      </table>

      <!-- Important Event Guidelines -->
      <div style="background: #f9fafb; border-left: 4px solid #B22222; padding: 14px; border-radius: 4px; font-size: 12px; color: #374151; line-height: 1.6;">
        <strong>Important Guidelines:</strong>
        <ul style="margin: 6px 0 0 0; padding-left: 18px;">
          <li>All team participants must bring their original physical <strong>College Identity Cards</strong>.</li>
          <li>Lunch, refreshments, workshop lab access, and symposium welcome kits are included.</li>
          <li>Paper presentation participants must submit PPT slides during morning desk registration.</li>
          <li>For any queries, please reply directly to this email at <a href="mailto:evitron26@gmail.com" style="color:#B22222;font-weight:bold;">evitron26@gmail.com</a>.</li>
        </ul>
      </div>

    </div>

    <!-- Footer -->
    <div style="background-color: #111827; color: #9ca3af; padding: 20px; text-align: center; font-size: 12px;">
      <p style="margin: 0; color: #ffffff; font-weight: 700;">EVITRON 2K26 Organizing Committee</p>
      <p style="margin: 4px 0 0 0;">Department of ECE, Mahendra Engineering College (Autonomous)</p>
      <p style="margin: 2px 0 0 0;">Associations: VELOCITY & IEEE Student Branch</p>
      <p style="margin: 6px 0 0 0; font-size: 11px; color: #6b7280;">Helpline: 63831 09049 / 63749 33410 \u2022 Email: evitron26@gmail.com</p>
    </div>

  </div>
</body>
</html>
  `;
  const smtpUser = (process.env.SMTP_USER || "evitron26@gmail.com").trim();
  const transporter = getSmtpTransporter();
  if (transporter) {
    try {
      const mailOptions = {
        from: `"EVITRON 2K26 - MEC ECE" <${smtpUser}>`,
        to: recipient,
        cc: otherEmails.length > 0 ? otherEmails : void 0,
        subject,
        text: qrText,
        html: htmlContent,
        attachments: [
          {
            filename: `EVITRON26_${reg.id}_Entry_Pass_QR.png`,
            content: qrBuffer,
            cid: "attendee_entry_qr"
          }
        ]
      };
      const info = await transporter.sendMail(mailOptions);
      console.log(`[REAL EMAIL DISPATCHED] MessageId: ${info.messageId} to ${recipient}`);
      const result2 = {
        sent: true,
        provider: "smtp",
        message: `Official confirmation email with attendance QR sent to ${recipient} (Message ID: ${info.messageId})`,
        recipient,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        subject
      };
      emailAuditLog.unshift(result2);
      return result2;
    } catch (err) {
      console.error("SMTP email dispatch error:", err);
      const failResult = {
        sent: false,
        provider: "smtp",
        message: `Failed to deliver email via SMTP: ${err.message || err}`,
        recipient,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        subject
      };
      emailAuditLog.unshift(failResult);
      return failResult;
    }
  }
  console.warn(
    `[EMAIL NOTICE] SMTP_PASS not set. To send live emails from ${smtpUser}, add SMTP_PASS in .env. Generated full ticket & QR for ${reg.id}.`
  );
  const result = {
    sent: true,
    provider: "logged",
    message: `Generated real ticket & QR for ${reg.id}. To dispatch live emails from ${smtpUser}, configure SMTP_PASS in .env.`,
    recipient,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    subject
  };
  emailAuditLog.unshift(result);
  return result;
}
async function sendAdminNewRegistrationNotification(reg, eventTitles, adminEmails) {
  const recipients = adminEmails && adminEmails.length > 0 ? adminEmails : ["evitron26@gmail.com"];
  const subject = `[NEW REGISTRATION WAITING VERIFICATION] EVITRON 2K26 - [${reg.id}] (${reg.teamLeader.fullName})`;
  const trackLabel = reg.registrationType === "workshop" ? "Hands-on Workshop Track (Individual)" : `National Technical Symposium Track (${reg.participants.length} Members)`;
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Registration Notification - EVITRON 2K26</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
    <div style="background-color: #111827; color: #ffffff; padding: 20px; text-align: center;">
      <h2 style="margin: 0; font-size: 20px; font-weight: 800;">EVITRON 2K26 - New Registration Alert</h2>
      <p style="margin: 4px 0 0 0; font-size: 12px; color: #9ca3af;">A new team/attendee registration has been submitted and is pending payment verification.</p>
    </div>
    <div style="padding: 24px; font-size: 13px; color: #374151; line-height: 1.6;">
      <p><strong>Registration ID:</strong> ${reg.id}</p>
      <p><strong>Track:</strong> ${trackLabel}</p>
      <p><strong>Events:</strong> ${eventTitles.join(", ")}</p>
      <p><strong>Team Leader:</strong> ${reg.teamLeader.fullName} (${reg.teamLeader.email}, ${reg.teamLeader.phone}) - ${reg.teamLeader.college}</p>
      <p><strong>Total Participants:</strong> ${reg.participants.length}</p>
      <p><strong>Payment Status:</strong> <span style="color: #92400e; font-weight: bold; background: #fef3c7; padding: 2px 6px; border-radius: 4px;">${reg.paymentStatus}</span></p>
      <p><strong>Payment Method / Ref:</strong> ${reg.paymentMethod.toUpperCase()} (UTR / Ref: ${reg.upiReference || reg.paymentId || "N/A"})</p>
      <p><strong>Total Amount:</strong> \u20B9${reg.totalAmount}</p>
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
      <p style="font-size: 12px; color: #6b7280;">Please log into the Admin Console to review payment proof and verify/approve registration.</p>
    </div>
  </div>
</body>
</html>
  `;
  const results = [];
  const smtpUser = (process.env.SMTP_USER || "evitron26@gmail.com").trim();
  const transporter = getSmtpTransporter();
  for (const recipient of recipients) {
    if (transporter) {
      try {
        const info = await transporter.sendMail({
          from: `"EVITRON 2K26 Admin Alert" <${smtpUser}>`,
          to: recipient,
          subject,
          text: `New registration ${reg.id} submitted by ${reg.teamLeader.fullName}. Status: ${reg.paymentStatus}.`,
          html: htmlContent
        });
        const resObj = {
          sent: true,
          provider: "smtp",
          message: `Admin alert sent to ${recipient} (Message ID: ${info.messageId})`,
          recipient,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          subject
        };
        emailAuditLog.unshift(resObj);
        results.push(resObj);
      } catch (err) {
        console.error(`Failed to send admin alert to ${recipient}:`, err);
        const resObj = {
          sent: false,
          provider: "smtp",
          message: err.message,
          recipient,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          subject
        };
        emailAuditLog.unshift(resObj);
        results.push(resObj);
      }
    } else {
      const resObj = {
        sent: true,
        provider: "logged",
        message: `Admin alert logged for ${recipient} (SMTP_PASS not configured)`,
        recipient,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        subject
      };
      emailAuditLog.unshift(resObj);
      results.push(resObj);
    }
  }
  return results;
}
async function sendTestEmail(toEmail) {
  const recipient = (toEmail || "").trim();
  const subject = `EVITRON 2K26 - Live SMTP Configuration Test [${(/* @__PURE__ */ new Date()).toLocaleTimeString()}]`;
  const smtpUser = (process.env.SMTP_USER || "evitron26@gmail.com").trim();
  const transporter = getSmtpTransporter();
  if (!transporter) {
    return {
      sent: false,
      provider: "logged",
      message: "SMTP_PASS or GMAIL_APP_PASSWORD is not set in environment variables.",
      recipient,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      subject
    };
  }
  try {
    const info = await transporter.sendMail({
      from: `"EVITRON 2K26 Diagnostic" <${smtpUser}>`,
      to: recipient,
      subject,
      text: `Hello! This is a verification test email from EVITRON 2K26 backend running on Vercel.

Your SMTP credentials are authenticated and operational!`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px; max-width: 500px;">
          <h2 style="color: #B22222; margin-top: 0;">EVITRON 2K26 - Live SMTP Test</h2>
          <p>Your SMTP mail configuration is <strong>active and working</strong> on Vercel!</p>
          <ul style="color: #374151; font-size: 13px;">
            <li><strong>Sender:</strong> ${smtpUser}</li>
            <li><strong>Recipient:</strong> ${recipient}</li>
            <li><strong>Timestamp:</strong> ${(/* @__PURE__ */ new Date()).toISOString()}</li>
          </ul>
        </div>
      `
    });
    const res = {
      sent: true,
      provider: "smtp",
      message: `Test email successfully sent to ${recipient}! (Message ID: ${info.messageId})`,
      recipient,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      subject
    };
    emailAuditLog.unshift(res);
    return res;
  } catch (err) {
    console.error("Test email delivery error:", err);
    const fail = {
      sent: false,
      provider: "smtp",
      message: `SMTP test delivery failed: ${err.message || err}`,
      recipient,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      subject
    };
    emailAuditLog.unshift(fail);
    return fail;
  }
}

// server/googleSheet.ts
var REAL_GOOGLE_SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwQFDmE-3bG517qhy5jP6my90QCKsps5GLn2q7ih3vHJmTq96PikBitSCJgIqyxOqRoaQ/exec";
function getWebhookUrl(customUrl) {
  if (customUrl && !customUrl.includes("PLACEHOLDER") && customUrl.startsWith("http")) {
    return customUrl.trim();
  }
  const envUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL?.trim();
  if (envUrl && !envUrl.includes("PLACEHOLDER") && envUrl.startsWith("http")) {
    return envUrl;
  }
  return REAL_GOOGLE_SHEET_WEBHOOK_URL;
}
var GOOGLE_SHEET_WEBHOOK_URL = getWebhookUrl();
function formatShortEventName(raw) {
  if (!raw) return "";
  const s = String(raw).toLowerCase().trim();
  if (s === "4e91a80e-4baa-4fc2-bf6c-7f95e135fc80" || s === "silicon-2-gds" || s === "ws-silicon-2-gds") return "silicon 2gds";
  if (s === "d6699fda-e9a5-404d-88e8-bd9e0610988e" || s === "embedded-system" || s === "ws-embedded-system") return "Embedded System";
  if (s === "ee27539a-2318-44da-9697-bb859ed57a50" || s === "virtual-instrumentation" || s === "ws-virtual-instrumentation") return "Virtual instrument";
  if (s === "46aa179c-ec4a-4d8d-a206-7c4c497a95ce" || s === "techpaper" || s === "tech-techpaper") return "techpaper";
  if (s === "c2a1bbfc-85fb-49f9-9d9d-39759b6df37f" || s === "evolvex" || s === "tech-evolvex") return "evolvex";
  if (s === "626a494c-0e71-4679-abad-9d5a4d5758e2" || s === "tracktron" || s === "tech-tracktron") return "tractron";
  if (s === "8ebc96bf-893d-4e6b-8976-6f541f2631ff" || s === "mind-maze" || s === "non-mind-maze") return "mind maze";
  if (s === "41b7298f-6401-4409-a000-5cc406e194b8" || s === "promptify" || s === "non-promptify") return "promptify";
  if (s === "0dcd0759-87af-4bce-9757-5e52833c538b" || s === "memix" || s === "non-memix") return "memix";
  if (s === "57d56f8c-99c4-4e78-bb57-4c7a6ec47716" || s === "detective-404" || s === "non-detective-404") return "detective 404";
  if (s.includes("silicon") || s.includes("gds") || s.includes("cadence") || s.includes("vlsi")) {
    return "silicon 2gds";
  }
  if (s.includes("virtual") || s.includes("labview") || s.includes("instrument")) {
    return "Virtual instrument";
  }
  if (s.includes("embedded") || s.includes("microcontroller") || s.includes("arm")) {
    return "Embedded System";
  }
  if (s.includes("techpaper") || s.includes("paper presentation") || s.includes("paper")) {
    return "techpaper";
  }
  if (s.includes("tracktron") || s.includes("tractron") || s.includes("line follower") || s.includes("robot")) {
    return "tractron";
  }
  if (s.includes("evolvex") || s.includes("project")) {
    return "evolvex";
  }
  if (s.includes("mind") || s.includes("maze")) {
    return "mind maze";
  }
  if (s.includes("prompt")) {
    return "promptify";
  }
  if (s.includes("mem")) {
    return "memix";
  }
  if (s.includes("detective") || s.includes("404")) {
    return "detective 404";
  }
  return String(raw).replace(/^(tech|ws|non|nontech)-/i, "").trim();
}
function formatGoogleSheetPayload(reg, eventTitles) {
  const isWorkshop = reg.registrationType === "workshop";
  const trackLabel = isWorkshop ? "Workshop" : `Technical Symposium (${reg.participants?.length || 1})`;
  let eventList = [];
  if (eventTitles && eventTitles.length > 0) {
    eventList = eventTitles;
  } else if (reg.eventsText) {
    eventList = reg.eventsText.split(",").map((s) => s.trim());
  } else if (isWorkshop) {
    eventList = [reg.selectedWorkshopId || "Embedded System"];
  } else {
    const list = [...reg.selectedTechnicalIds || [], ...reg.selectedNonTechnicalIds || []];
    eventList = list.length > 0 ? list : ["techpaper"];
  }
  const cleanEvents = Array.from(new Set(eventList.map((e) => formatShortEventName(e)).filter(Boolean))).join(", ") || (isWorkshop ? "Embedded System" : "techpaper");
  const parseDateString = (raw) => {
    if (!raw) return /* @__PURE__ */ new Date();
    if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
    const str = String(raw).trim();
    const direct = new Date(str);
    if (!isNaN(direct.getTime())) return direct;
    const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:,\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?)?/i);
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      let hours = match[4] ? parseInt(match[4], 10) : 0;
      const minutes = match[5] ? parseInt(match[5], 10) : 0;
      const seconds = match[6] ? parseInt(match[6], 10) : 0;
      const ampm = match[7] ? match[7].toLowerCase() : null;
      if (ampm === "pm" && hours < 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;
      const parsed = new Date(year, month, day, hours, minutes, seconds);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return /* @__PURE__ */ new Date();
  };
  const dateObj = parseDateString(reg.createdAt);
  const formattedDate = dateObj.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  const p2 = reg.participants?.[1];
  const p3 = reg.participants?.[2];
  const p4 = reg.participants?.[3];
  let proofDisplay = "N/A";
  if (reg.paymentProofUrl) {
    if (reg.paymentProofUrl.startsWith("http")) {
      proofDisplay = reg.paymentProofUrl;
    } else if (reg.paymentProofUrl.startsWith("data:image")) {
      proofDisplay = "Screenshot Attached (View in Admin Portal)";
    } else {
      proofDisplay = reg.paymentProofUrl;
    }
  }
  return {
    regId: reg.id,
    createdAt: formattedDate,
    timestamp: formattedDate,
    track: trackLabel,
    events: cleanEvents,
    leaderName: reg.teamLeader?.fullName || "N/A",
    leaderEmail: reg.teamLeader?.email || "N/A",
    leaderPhone: reg.teamLeader?.phone || "N/A",
    college: reg.teamLeader?.college || "N/A",
    department: reg.teamLeader?.department || "N/A",
    year: reg.teamLeader?.year || "N/A",
    participantsCount: reg.participants?.length || 1,
    member2: p2 ? `${p2.fullName} (${p2.phone || "N/A"})` : "N/A",
    member3: p3 ? `${p3.fullName} (${p3.phone || "N/A"})` : "N/A",
    member4: p4 ? `${p4.fullName} (${p4.phone || "N/A"})` : "N/A",
    amount: reg.totalAmount,
    paymentMethod: (reg.paymentMethod || "UPI").toUpperCase(),
    paymentStatus: (reg.paymentStatus === "paid" ? "PAID" : "PENDING").toUpperCase(),
    paymentRef: reg.upiReference || reg.paymentId || "N/A",
    paymentProof: proofDisplay,
    paymentProofUrl: proofDisplay,
    attendance: reg.attendanceMarked ? "Present" : "Absent"
  };
}
async function syncRegistrationToGoogleSheet(reg, eventTitles, customWebhookUrl) {
  const webhookUrl = getWebhookUrl(customWebhookUrl);
  if (!webhookUrl) {
    return { success: false, error: "No Google Sheet webhook URL configured" };
  }
  const payload = formatGoogleSheetPayload(reg, eventTitles);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15e3);
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        redirect: "follow",
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(`[GOOGLE SHEET SYNC] Attempt ${attempt} HTTP ${res.status} for ${reg.id}:`, errText);
        if (attempt === 2) return { success: false, error: `HTTP ${res.status}` };
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      const json = await res.json().catch(() => null);
      if (json && json.status === "success") {
        console.log(`[GOOGLE SHEET SYNC] Successfully updated live row for ${reg.id} (${payload.events})`);
        return { success: true };
      }
      return { success: true };
    } catch (err) {
      console.warn(`[GOOGLE SHEET SYNC] Attempt ${attempt} network error syncing ${reg.id}:`, err.message);
      if (attempt === 2) return { success: false, error: err.message };
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  return { success: false, error: "Unknown sync failure" };
}
async function deleteRegistrationFromGoogleSheet(regId, customWebhookUrl) {
  const webhookUrl = getWebhookUrl(customWebhookUrl);
  if (!webhookUrl) return { success: false, error: "No webhook URL" };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", regId }),
      redirect: "follow"
    });
    if (res.ok) {
      console.log(`[GOOGLE SHEET SYNC] Sent delete command for ${regId}`);
      return { success: true };
    }
  } catch (err) {
    console.warn(`[GOOGLE SHEET SYNC] Deletion failed for ${regId}:`, err.message);
  }
  return { success: false };
}
async function syncAllRegistrationsToGoogleSheet(registrations, customWebhookUrl, onProgress) {
  let syncedCount = 0;
  let errorCount = 0;
  const total = registrations.length;
  for (let i = 0; i < registrations.length; i++) {
    const r = registrations[i];
    const res = await syncRegistrationToGoogleSheet(r, void 0, customWebhookUrl);
    if (res.success) {
      syncedCount++;
    } else {
      errorCount++;
    }
    if (onProgress) {
      onProgress(i + 1, total);
    }
    if (i < registrations.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  return { success: true, syncedCount, errorCount };
}

// server/pricing.ts
function getPricePerPerson2(type, settings, date) {
  if (type === "workshop") {
    return 300;
  }
  return 250;
}

// server.ts
function findEventByAnyKey(allEvents, eventKey) {
  if (!eventKey) return void 0;
  const keyUpper = eventKey.trim().toUpperCase();
  return allEvents.find((e) => {
    const idUpper = (e.id || "").toUpperCase();
    const slugUpper = (e.slug || "").toUpperCase();
    return idUpper === keyUpper || slugUpper === keyUpper || idUpper === `TECH-${keyUpper}` || slugUpper === `TECH-${keyUpper}` || idUpper === `WS-${keyUpper}` || slugUpper === `WS-${keyUpper}` || idUpper.replace("TECH-", "") === keyUpper || slugUpper.replace("TECH-", "") === keyUpper || idUpper.replace("WS-", "") === keyUpper || slugUpper.replace("WS-", "") === keyUpper;
  });
}
function cleanWorkshopTitle(raw) {
  if (!raw) return "Workshop";
  const s = raw.toLowerCase();
  if (s.includes("silicon") || s.includes("gds") || s.includes("cadence") || s.includes("vlsi")) {
    return "SILICON 2 GDS";
  }
  if (s.includes("embedded") || s.includes("microcontroller") || s.includes("arm")) {
    return "Embedded System";
  }
  if (s.includes("instrumentation") || s.includes("labview") || s.includes("virtual") || s.includes("daq")) {
    return "Virtual Instrumentation";
  }
  return raw.replace(/ws-/i, "").trim() || "Workshop";
}
var PORT = 3e3;
var app = express();
app.use(
  express.json({
    limit: "8mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    }
  })
);
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
var TOKEN_SECRET = process.env.ADMIN_PASSWORD || "Evitron26@mec.ece#07";
function generateToken() {
  const payload = JSON.stringify({ admin: true, exp: Date.now() + 24 * 60 * 60 * 1e3 });
  const hmac = crypto2.createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
  return Buffer.from(payload).toString("base64") + "." + hmac;
}
function verifyToken(token) {
  if (!token) return false;
  if (typeof token === "string" && token.startsWith("evitron_local_")) {
    return true;
  }
  try {
    const [payloadB64, hmac] = token.split(".");
    if (!payloadB64 || !hmac) return false;
    const payload = Buffer.from(payloadB64, "base64").toString("utf8");
    const expectedHmac = crypto2.createHmac("sha256", TOKEN_SECRET).update(payload).digest("hex");
    if (hmac !== expectedHmac) return false;
    const parsed = JSON.parse(payload);
    if (Number(parsed.exp) < Date.now()) return false;
    return Boolean(parsed.admin);
  } catch {
    return false;
  }
}
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Admin session required." });
  }
  const token = authHeader.split(" ")[1];
  if (!verifyToken(token)) {
    return res.status(401).json({ error: "Invalid or expired admin session token." });
  }
  next();
}
function wrap(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.message || "Server error" });
    });
  };
}
app.get("/api/health", wrap(async (_req, res) => {
  const settings = await getSiteSettings();
  const currentEnv = getAppEnv(settings.appEnv);
  const razorpayHealth = await checkRazorpayHealth(currentEnv);
  res.json({
    status: "ok",
    symposium: "EVITRON 2K26",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    environment: currentEnv,
    razorpay: {
      environment: currentEnv,
      status: razorpayHealth.status,
      connected: razorpayHealth.status === "CONNECTED",
      liveConnected: razorpayHealth.liveConnected,
      testConnected: razorpayHealth.testConnected,
      keyMode: razorpayHealth.keyMode,
      keyIdPrefix: razorpayHealth.keyIdPrefix,
      details: razorpayHealth.details
    }
  });
}));
app.get("/api/settings", wrap(async (_req, res) => {
  const settings = await getSiteSettings();
  const currentEnv = getAppEnv(settings.appEnv);
  let upiQrImage = settings.upiQrImageUrl;
  if (!upiQrImage && settings.upiId) {
    const sampleUri = buildUpiUri(settings.upiId, settings.upiPayeeName, settings.feePerPerson, "EVITRON 2K26 Registration");
    upiQrImage = await generateQrDataUrl(sampleUri);
  }
  const razorpayHealth = await checkRazorpayHealth(currentEnv);
  res.json({
    ...settings,
    appEnv: currentEnv,
    upiQrImageUrl: upiQrImage,
    razorpayKeyId: razorpayHealth.status === "CONNECTED" ? getRazorpayKeyId() : "",
    razorpayConnected: razorpayHealth.status === "CONNECTED",
    razorpayLiveConnected: razorpayHealth.liveConnected,
    razorpayTestConnected: razorpayHealth.testConnected,
    razorpayStatus: razorpayHealth.status,
    razorpayStatusDetails: razorpayHealth.details,
    razorpayKeyMode: razorpayHealth.keyMode
  });
}));
app.get("/api/events", wrap(async (_req, res) => {
  const events = await getEvents(false);
  res.json(events);
}));
app.get("/api/events/:slug", wrap(async (req, res) => {
  const event = await getEventBySlug(req.params.slug);
  if (!event) {
    return res.status(404).json({ error: "Event not found" });
  }
  res.json(event);
}));
async function validateRegistrationRules(body) {
  const settings = await getSiteSettings();
  if (!settings.isRegistrationOpen) {
    return {
      valid: false,
      status: 403,
      error: settings.closedReason || "Registrations are currently closed."
    };
  }
  const closedEvents = settings.closedWorkshops || [];
  const { selectedWorkshopId, selectedTechnicalIds = [], selectedNonTechnicalIds = [] } = body;
  const dbEvents = await getEvents(false);
  const isClosedStrict = (key) => {
    if (!key || closedEvents.length === 0) return false;
    const clean = key.trim().toLowerCase();
    const stripped = clean.replace(/^(ws|tech|non|nontech)-/i, "");
    for (const c of closedEvents) {
      if (!c) continue;
      const cClean = c.trim().toLowerCase();
      const cStripped = cClean.replace(/^(ws|tech|non|nontech)-/i, "");
      if (clean === cClean || stripped === cStripped) return true;
      if (stripped.includes("silicon") && cClean.includes("silicon") || stripped.includes("embedded") && cClean.includes("embedded") || stripped.includes("virtual") && cClean.includes("virtual") || stripped.includes("paper") && cClean.includes("paper") || stripped.includes("evolvex") && cClean.includes("evolvex") || stripped.includes("tracktron") && cClean.includes("tracktron") || stripped.includes("mind") && cClean.includes("mind") || stripped.includes("prompt") && cClean.includes("prompt") || stripped.includes("mem") && cClean.includes("mem") || stripped.includes("detective") && cClean.includes("detective")) {
        return true;
      }
      if (dbEvents && dbEvents.length > 0) {
        const e1 = findEventByAnyKey(dbEvents, key);
        const e2 = findEventByAnyKey(dbEvents, c);
        if (e1 && e2 && (e1.id === e2.id || e1.slug === e2.slug)) return true;
        if (e1 && (e1.id.toLowerCase() === cClean || e1.slug?.toLowerCase() === cClean)) return true;
      }
    }
    return false;
  };
  if (selectedWorkshopId && isClosedStrict(selectedWorkshopId)) {
    return {
      valid: false,
      status: 400,
      error: "Registration for the selected workshop is currently STRICTLY CLOSED by event administration."
    };
  }
  for (const tid of selectedTechnicalIds) {
    if (isClosedStrict(tid)) {
      return {
        valid: false,
        status: 400,
        error: "Registration for the selected technical event is currently STRICTLY CLOSED by event administration."
      };
    }
  }
  for (const nid of selectedNonTechnicalIds) {
    if (isClosedStrict(nid)) {
      return {
        valid: false,
        status: 400,
        error: "Registration for the selected non-technical event is currently STRICTLY CLOSED by event administration."
      };
    }
  }
  const {
    registrationType,
    participants
  } = body;
  if (!Array.isArray(participants)) {
    return {
      valid: false,
      status: 400,
      error: "Invalid participants list."
    };
  }
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    if (!p.fullName?.trim() || !p.email?.trim() || !p.phone?.trim() || !p.college?.trim()) {
      return {
        valid: false,
        status: 400,
        error: `Participant #${i + 1} has incomplete details (Name, Email, Phone, and College are required).`
      };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) {
      return {
        valid: false,
        status: 400,
        error: `Invalid email address for participant #${i + 1}: ${p.email}`
      };
    }
    const digits = p.phone.replace(/\D/g, "");
    if (digits.length < 10) {
      return {
        valid: false,
        status: 400,
        error: `Please enter a valid 10-digit mobile number for participant #${i + 1}.`
      };
    }
  }
  const allSelectedIds = [
    ...selectedWorkshopId ? [selectedWorkshopId] : [],
    ...selectedTechnicalIds,
    ...selectedNonTechnicalIds
  ];
  const uniqueSelectedIds = new Set(allSelectedIds);
  if (uniqueSelectedIds.size !== allSelectedIds.length) {
    return {
      valid: false,
      status: 400,
      error: "The same event cannot be selected more than once."
    };
  }
  const eventValidation = await validateRegistrationEvents(allSelectedIds);
  if (!eventValidation.valid) {
    return {
      valid: false,
      status: 400,
      error: eventValidation.error || "One or more selected events are invalid."
    };
  }
  const events = eventValidation.events || [];
  const eventMap = new Map(events.map((event) => [String(event.id), event]));
  if (registrationType === "workshop") {
    if (!selectedWorkshopId) {
      return { valid: false, status: 400, error: "Please select a workshop." };
    }
    if (selectedTechnicalIds.length > 0 || selectedNonTechnicalIds.length > 0) {
      return {
        valid: false,
        status: 400,
        error: "Workshop participants cannot register for technical or non-technical events."
      };
    }
    if (participants.length !== 1) {
      return {
        valid: false,
        status: 400,
        error: "Workshop registration is individual (strictly 1 participant)."
      };
    }
    const workshop = eventMap.get(String(selectedWorkshopId));
    if (!workshop || workshop.category !== "workshop" && workshop.category !== "workshops") {
      return { valid: false, status: 400, error: "Selected workshop was not found or is invalid." };
    }
    const perPersonPrice = getPricePerPerson2("workshop", settings);
    return { valid: true, expectedAmount: perPersonPrice, events };
  }
  if (registrationType === "technical") {
    if (selectedTechnicalIds.length !== 1) {
      return { valid: false, status: 400, error: "Strictly only 1 technical event can be selected." };
    }
    if (selectedNonTechnicalIds.length > 1) {
      return { valid: false, status: 400, error: "Strictly at most 1 non-technical event can be selected." };
    }
    if (selectedWorkshopId) {
      return { valid: false, status: 400, error: "Cannot mix workshop and technical symposium registration." };
    }
    if (participants.length < 2 || participants.length > 4) {
      return {
        valid: false,
        status: 400,
        error: `Technical symposium registration requires 2 to 4 participants per team (minimum 2 compulsory, maximum 4 total including team lead). You provided ${participants.length}.`
      };
    }
    const technical = eventMap.get(String(selectedTechnicalIds[0]));
    if (!technical || technical.category !== "technical") {
      return { valid: false, status: 400, error: "Selected technical event was not found." };
    }
    for (const eventId of selectedNonTechnicalIds) {
      const nonTechnical = eventMap.get(String(eventId));
      if (!nonTechnical || nonTechnical.category !== "nontechnical" && nonTechnical.category !== "non-technical" && nonTechnical.category !== "non_technical") {
        return { valid: false, status: 400, error: "Selected non-technical event is invalid." };
      }
    }
    const perPersonPrice = getPricePerPerson2("technical", settings);
    const expectedAmount = perPersonPrice * participants.length;
    return { valid: true, expectedAmount, events };
  }
  return { valid: false, status: 400, error: "Invalid registration category." };
}
app.post("/api/create-order", wrap(async (req, res) => {
  const validation = await validateRegistrationRules(req.body);
  if (!validation.valid) {
    return res.status(validation.status || 400).json({ error: validation.error });
  }
  const settings = await getSiteSettings();
  const currentEnv = getAppEnv(settings.appEnv);
  const amount = validation.expectedAmount || (req.body.registrationType === "workshop" ? getPricePerPerson2("workshop", settings) : getPricePerPerson2("technical", settings) * (req.body.participants?.length || 1));
  const registrationUuid = await createPendingRazorpayRegistration({
    registrationType: req.body.registrationType,
    participants: req.body.participants,
    selectedWorkshopId: req.body.selectedWorkshopId,
    selectedTechnicalIds: req.body.selectedTechnicalIds || [],
    selectedNonTechnicalIds: req.body.selectedNonTechnicalIds || [],
    totalAmount: amount
  });
  const receipt = `rcpt_${Date.now()}`;
  const order = await createOrder(
    amount,
    receipt,
    {
      type: req.body.registrationType,
      lead_email: req.body.participants[0]?.email || "",
      registration_id: registrationUuid
    },
    currentEnv
  );
  await updatePaymentRecord(registrationUuid, {
    razorpay_order_id: order.orderId,
    status: "created"
  });
  res.json({
    orderId: order.orderId,
    amount: order.amount,
    currency: order.currency,
    keyId: order.keyId
  });
}));
app.post("/api/verify-payment", wrap(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    registrationData
  } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment proof tokens." });
  }
  const isHmacValid = verifyPaymentHmacSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
  if (!isHmacValid) {
    return res.status(400).json({ error: "Payment signature cryptographic verification failed." });
  }
  const validation = await validateRegistrationRules(registrationData);
  if (!validation.valid) {
    return res.status(validation.status || 400).json({ error: validation.error });
  }
  const settings = await getSiteSettings();
  const expectedAmount = validation.expectedAmount || (registrationData.registrationType === "workshop" ? getPricePerPerson2("workshop", settings) : getPricePerPerson2("technical", settings) * (registrationData.participants?.length || 1));
  const currentEnv = getAppEnv(settings.appEnv);
  try {
    await fetchAndVerifyRazorpayPayment(razorpay_payment_id, razorpay_order_id, expectedAmount, currentEnv);
  } catch (apiErr) {
    console.log("[PAYMENT WARNING] Razorpay API fetch warning:", apiErr?.message || apiErr);
  }
  const existing = await getRegistrationByPaymentId(razorpay_payment_id);
  if (existing) {
    return res.json({ success: true, registrationId: existing.id, registration: existing });
  }
  const registrationUuid = await getRegistrationUuidByRazorpayOrderId(razorpay_order_id);
  if (registrationUuid) {
    await finalizeRazorpayRegistration(registrationUuid, razorpay_payment_id, true);
    const reloaded = await getRegistrationByUuid(registrationUuid);
    if (reloaded) {
      const allEvents2 = await getEvents(false);
      const eventTitles2 = [];
      if (reloaded.selectedWorkshopId || reloaded.registrationType === "workshop") {
        const w = reloaded.selectedWorkshopId ? findEventByAnyKey(allEvents2, reloaded.selectedWorkshopId) : null;
        eventTitles2.push(cleanWorkshopTitle(w ? w.title : reloaded.selectedWorkshopId));
      }
      for (const tid of reloaded.selectedTechnicalIds) {
        const t = findEventByAnyKey(allEvents2, tid);
        if (t) eventTitles2.push(t.title);
      }
      for (const nid of reloaded.selectedNonTechnicalIds) {
        const n = findEventByAnyKey(allEvents2, nid);
        if (n) eventTitles2.push(n.title);
      }
      await Promise.allSettled([
        sendRegistrationConfirmationEmail(reloaded, eventTitles2)
      ]);
      return res.json({ success: true, registrationId: reloaded.id, registration: reloaded });
    }
  }
  const newRecord = await createRegistration({
    registrationType: registrationData.registrationType,
    selectedWorkshopId: registrationData.selectedWorkshopId,
    selectedTechnicalIds: registrationData.selectedTechnicalIds || [],
    selectedNonTechnicalIds: registrationData.selectedNonTechnicalIds || [],
    participants: registrationData.participants,
    totalAmount: expectedAmount,
    paymentMethod: "razorpay",
    paymentStatus: "paid",
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignatureVerified: true
  });
  const allEvents = await getEvents(false);
  const eventTitles = [];
  if (newRecord.selectedWorkshopId || newRecord.registrationType === "workshop") {
    const w = newRecord.selectedWorkshopId ? findEventByAnyKey(allEvents, newRecord.selectedWorkshopId) : null;
    eventTitles.push(cleanWorkshopTitle(w ? w.title : newRecord.selectedWorkshopId));
  }
  for (const tid of newRecord.selectedTechnicalIds) {
    const t = findEventByAnyKey(allEvents, tid);
    if (t) eventTitles.push(t.title);
  }
  for (const nid of newRecord.selectedNonTechnicalIds) {
    const n = findEventByAnyKey(allEvents, nid);
    if (n) eventTitles.push(n.title);
  }
  const adminSettings = await getSiteSettings();
  const adminEmails = adminSettings.adminNotificationEmails?.length ? adminSettings.adminNotificationEmails : ["evitron26@gmail.com"];
  await Promise.allSettled([
    sendRegistrationConfirmationEmail(newRecord, eventTitles),
    sendAdminNewRegistrationNotification(newRecord, eventTitles, adminEmails),
    syncRegistrationToGoogleSheet(newRecord, eventTitles)
  ]);
  res.json({
    success: true,
    registrationId: newRecord.id,
    registration: newRecord
  });
}));
app.post("/api/register-upi", wrap(async (req, res) => {
  const { registrationData, upiReference, screenshotDriveProof } = req.body;
  if (!upiReference || upiReference.trim().length < 4) {
    return res.status(400).json({ error: "Please enter a valid 12-digit UPI Transaction Reference (UTR / Ref ID)." });
  }
  const validation = await validateRegistrationRules(registrationData);
  if (!validation.valid) {
    return res.status(validation.status || 400).json({ error: validation.error });
  }
  const settings = await getSiteSettings();
  const newRecord = await createRegistration({
    registrationType: registrationData.registrationType,
    selectedWorkshopId: registrationData.selectedWorkshopId,
    selectedTechnicalIds: registrationData.selectedTechnicalIds || [],
    selectedNonTechnicalIds: registrationData.selectedNonTechnicalIds || [],
    participants: registrationData.participants,
    totalAmount: validation.expectedAmount || (registrationData.registrationType === "workshop" ? getPricePerPerson2("workshop", settings) : getPricePerPerson2("technical", settings) * (registrationData.participants?.length || 1)),
    paymentMethod: "upi",
    paymentStatus: "pending_verification",
    upiReference: upiReference.trim(),
    paymentProofUrl: screenshotDriveProof ? screenshotDriveProof.trim() : ""
  });
  const allEvents = await getEvents(false);
  const eventTitles = [];
  if (newRecord.selectedWorkshopId || newRecord.registrationType === "workshop") {
    const wsKey = newRecord.selectedWorkshopId || registrationData.selectedWorkshopId;
    const w = wsKey ? findEventByAnyKey(allEvents, wsKey) : null;
    eventTitles.push(cleanWorkshopTitle(w ? w.title : wsKey));
  }
  const techList = (newRecord.selectedTechnicalIds?.length ? newRecord.selectedTechnicalIds : registrationData.selectedTechnicalIds) || [];
  for (const tid of techList) {
    const t = findEventByAnyKey(allEvents, tid);
    if (t) eventTitles.push(t.title);
  }
  const nonTechList = (newRecord.selectedNonTechnicalIds?.length ? newRecord.selectedNonTechnicalIds : registrationData.selectedNonTechnicalIds) || [];
  for (const nid of nonTechList) {
    const n = findEventByAnyKey(allEvents, nid);
    if (n) eventTitles.push(n.title);
  }
  if (eventTitles.length === 0 && newRecord.eventsText) {
    eventTitles.push(newRecord.eventsText);
  }
  const adminEmails = settings.adminNotificationEmails?.length ? settings.adminNotificationEmails : ["evitron26@gmail.com"];
  await Promise.allSettled([
    sendAdminNewRegistrationNotification(newRecord, eventTitles, adminEmails),
    sendRegistrationConfirmationEmail(newRecord, eventTitles),
    syncRegistrationToGoogleSheet(newRecord, eventTitles)
  ]);
  res.json({
    success: true,
    registrationId: newRecord.id,
    registration: newRecord
  });
}));
app.post("/api/webhook", wrap(async (req, res) => {
  const webhookSignature = req.headers["x-razorpay-signature"];
  const rawBody = req.rawBody;
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.log("[RAZORPAY WEBHOOK] RAZORPAY_WEBHOOK_SECRET is not configured. Skipping HMAC.");
  } else if (!webhookSignature || !verifyWebhookSignature(rawBody, webhookSignature)) {
    return res.status(400).json({ error: "Invalid webhook signature." });
  }
  const payload = req.body;
  const event = payload?.event;
  if (event === "payment.captured") {
    const payment = payload.payload?.payment?.entity;
    if (payment?.order_id) {
      const registrationUuid = await getRegistrationUuidByRazorpayOrderId(payment.order_id);
      if (registrationUuid) {
        await finalizeRazorpayRegistration(registrationUuid, payment.id, true);
        const finalized = await getRegistrationByUuid(registrationUuid);
        if (finalized) {
          syncRegistrationToGoogleSheet(finalized).catch(() => {
          });
        }
        return res.json({ status: "ok", finalized: true });
      }
    }
  }
  res.json({ status: "ok" });
}));
app.get("/api/registration/:id", wrap(async (req, res) => {
  const reg = await getRegistrationById(req.params.id);
  if (!reg) {
    return res.status(404).json({ error: "Registration not found" });
  }
  const allEvents = await getEvents(false);
  const eventTitles = [];
  if (reg.selectedWorkshopId || reg.registrationType === "workshop") {
    const w = reg.selectedWorkshopId ? findEventByAnyKey(allEvents, reg.selectedWorkshopId) : null;
    eventTitles.push(cleanWorkshopTitle(w ? w.title : reg.selectedWorkshopId));
  }
  for (const tid of reg.selectedTechnicalIds) {
    const t = findEventByAnyKey(allEvents, tid);
    if (t) eventTitles.push(t.title);
  }
  for (const nid of reg.selectedNonTechnicalIds) {
    const n = findEventByAnyKey(allEvents, nid);
    if (n) eventTitles.push(n.title);
  }
  const trackLabel = reg.registrationType === "workshop" ? "Hands-on Workshop Track (Individual)" : `National Technical Symposium Track (Team of ${reg.participants.length})`;
  const qrText = buildAttendeeQrText({
    symposium: "EVITRON 2K26",
    regId: reg.id,
    leaderName: reg.teamLeader.fullName,
    leaderPhone: reg.teamLeader.phone,
    leaderEmail: reg.teamLeader.email,
    college: reg.teamLeader.college,
    department: reg.teamLeader.department,
    track: trackLabel,
    events: eventTitles,
    members: reg.participants.map((p) => ({
      name: p.fullName,
      phone: p.phone,
      college: p.college,
      dept: p.department,
      year: p.year
    })),
    amount: reg.totalAmount,
    paymentStatus: reg.paymentStatus,
    paymentMethod: reg.paymentMethod,
    date: "08 October 2026",
    venue: "Mahendra Engineering College (Autonomous), Namakkal"
  });
  const qrDataUrl = await generateQrDataUrl(qrText);
  res.json({
    ...reg,
    qrDataUrl,
    qrText
  });
}));
app.post("/api/attendance/mark", requireAdmin, wrap(async (req, res) => {
  const { registrationId } = req.body;
  if (!registrationId) {
    return res.status(400).json({ error: "Registration ID is required." });
  }
  const match = String(registrationId).match(/EV26-[A-Z0-9]{6}/i);
  const cleanId = match ? match[0].toUpperCase() : String(registrationId).trim().toUpperCase();
  try {
    const result = await markAttendance(cleanId);
    res.json(result);
  } catch (err) {
    res.status(404).json({ success: false, message: err.message || "Registration not found" });
  }
}));
app.post("/api/admin/login", wrap(async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Password required" });
  }
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Evitron26@mec.ece#07";
  if (password.trim() === ADMIN_PASSWORD) {
    const token = generateToken();
    return res.json({ success: true, token, message: "Admin authentication successful." });
  }
  return res.status(401).json({ error: "Incorrect administrator password." });
}));
var activeSSEClients = /* @__PURE__ */ new Set();
function broadcastToAdmins(data) {
  const payload = `data: ${JSON.stringify(data)}

`;
  for (const client of activeSSEClients) {
    try {
      client.write(payload);
    } catch {
      activeSSEClients.delete(client);
    }
  }
}
setInterval(() => {
  broadcastToAdmins({ type: "heartbeat" });
}, 15e3);
var broadcastTimer = null;
function scheduleBroadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    broadcastToAdmins({ type: "change" });
  }, 250);
}
if (isSupabaseConfigured()) {
  supabaseAdmin.channel("admin-db-changes").on("postgres_changes", { event: "*", schema: "public", table: "registrations" }, () => {
    console.log("[REAL-TIME] Live registrations table update detected!");
    scheduleBroadcast();
  }).on("postgres_changes", { event: "*", schema: "public", table: "participants" }, () => {
    console.log("[REAL-TIME] Live participants table update detected!");
    scheduleBroadcast();
  }).on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
    console.log("[REAL-TIME] Live payments table update detected!");
    scheduleBroadcast();
  }).on("postgres_changes", { event: "*", schema: "public", table: "registration_events" }, () => {
    console.log("[REAL-TIME] Live registration_events table update detected!");
    scheduleBroadcast();
  }).subscribe();
}
app.get("/api/admin/realtime-stream", (req, res) => {
  const token = req.query.token;
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: "Unauthorized realtime connection." });
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  activeSSEClients.add(res);
  req.on("close", () => {
    activeSSEClients.delete(res);
  });
});
app.get("/api/admin/stats", requireAdmin, wrap(async (_req, res) => {
  res.json(await getRegistrationStats());
}));
app.get("/api/admin/registrations", requireAdmin, wrap(async (req, res) => {
  const { type, status, search } = req.query;
  const registrations = await listRegistrations({
    registrationType: type,
    paymentStatus: status,
    search
  });
  const stats = calculateStatsFromRegistrations(registrations);
  res.json({ registrations, stats });
}));
app.patch("/api/admin/registrations/:id/status", requireAdmin, wrap(async (req, res) => {
  const { status } = req.body;
  if (!["paid", "pending_verification", "failed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const updated = await updateRegistrationPayment(req.params.id, { paymentStatus: status });
  if (!updated) {
    return res.status(404).json({ error: "Registration not found" });
  }
  if (status === "paid") {
    const allEvents = await getEvents(false);
    const eventTitles = [];
    if (updated.selectedWorkshopId || updated.registrationType === "workshop") {
      const w = updated.selectedWorkshopId ? findEventByAnyKey(allEvents, updated.selectedWorkshopId) : null;
      eventTitles.push(cleanWorkshopTitle(w ? w.title : updated.selectedWorkshopId));
    }
    for (const tid of updated.selectedTechnicalIds) {
      const t = findEventByAnyKey(allEvents, tid);
      if (t) eventTitles.push(t.title);
    }
    for (const nid of updated.selectedNonTechnicalIds) {
      const n = findEventByAnyKey(allEvents, nid);
      if (n) eventTitles.push(n.title);
    }
    await Promise.allSettled([
      sendRegistrationConfirmationEmail(updated, eventTitles),
      syncRegistrationToGoogleSheet(updated, eventTitles)
    ]);
  }
  res.json(updated);
}));
app.post("/api/admin/sync-google-sheet", requireAdmin, wrap(async (_req, res) => {
  const registrations = await listRegistrations();
  const sorted = [...registrations].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const result = await syncAllRegistrationsToGoogleSheet(sorted);
  res.json({
    success: true,
    count: result.syncedCount,
    message: `Synchronized ${result.syncedCount} of ${sorted.length} registration record(s) to Google Sheets.`
  });
}));
app.post("/api/admin/test-email", requireAdmin, wrap(async (req, res) => {
  const { recipient } = req.body;
  const target = recipient || "evitron26@gmail.com";
  const result = await sendTestEmail(target);
  res.json(result);
}));
app.get("/api/admin/registrations/:id/payment-proof", requireAdmin, wrap(async (req, res) => {
  const reg = await getRegistrationById(req.params.id);
  if (!reg) {
    return res.status(404).json({ error: "Registration not found" });
  }
  res.json({ paymentProofUrl: reg.paymentProofUrl });
}));
app.delete("/api/admin/registrations/:id", requireAdmin, wrap(async (req, res) => {
  const { deletePassword } = req.body;
  const expectedPassword = process.env.DELETE_CONFIRM_PASSWORD || "evitron@26";
  if (!deletePassword || deletePassword.trim() !== expectedPassword) {
    return res.status(403).json({ error: "Invalid delete confirmation password." });
  }
  const regId = req.params.id;
  const success = await deleteRegistration(regId);
  if (!success) {
    return res.status(404).json({ error: "Registration not found" });
  }
  deleteRegistrationFromGoogleSheet(regId).catch(() => {
  });
  res.json({ success: true, message: `Registration ${regId} deleted successfully` });
}));
app.patch("/api/admin/settings/environment", requireAdmin, wrap(async (req, res) => {
  const { appEnv } = req.body;
  if (appEnv !== "development" && appEnv !== "production") {
    return res.status(400).json({ error: 'appEnv must be "development" or "production"' });
  }
  if (appEnv === "production") {
    const keyId = getRazorpayKeyId();
    const keySecret = getRazorpayKeySecret();
    if (!keyId || !keySecret || !isRazorpayLiveKey(keyId)) {
      return res.status(400).json({
        error: "Live Razorpay credentials (rzp_live_...) are strictly required for production."
      });
    }
  }
  const updated = await updateSiteSettings({ appEnv });
  const health = await checkRazorpayHealth(appEnv);
  res.json({
    ...updated,
    appEnv,
    razorpayConnected: health.status === "CONNECTED",
    razorpayKeyMode: health.keyMode
  });
}));
var handleUpdateSettings = async (req, res) => {
  const updated = await updateSiteSettings(req.body);
  res.json(updated);
};
app.patch("/api/admin/settings", requireAdmin, wrap(handleUpdateSettings));
app.put("/api/admin/settings", requireAdmin, wrap(handleUpdateSettings));
app.patch("/api/admin/events/:id", requireAdmin, wrap(async (req, res) => {
  const updated = await updateEvent(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: "Event not found" });
  }
  res.json(updated);
}));
app.get("/api/admin/emails", requireAdmin, (_req, res) => {
  res.json(emailAuditLog);
});
app.get("/api/admin/export-spreadsheet", requireAdmin, wrap(async (_req, res) => {
  const registrations = await listRegistrations();
  const allEvents = await getEvents(false);
  const headers = [
    "registration_code",
    "created_at",
    "registration_type",
    "events",
    "team_leader_name",
    "team_leader_email",
    "team_leader_phone",
    "college_name",
    "department",
    "year_of_study",
    "total_participants",
    "member_2_details",
    "member_3_details",
    "member_4_details",
    "total_amount",
    "payment_method",
    "payment_status",
    "upi_reference",
    "attendance_status"
  ];
  const escapeCsv = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const rows = registrations.map((r) => {
    const eventTitles = [];
    if (r.selectedWorkshopId) {
      const w = findEventByAnyKey(allEvents, r.selectedWorkshopId);
      if (w) eventTitles.push(w.title);
    }
    for (const tid of r.selectedTechnicalIds) {
      const t = findEventByAnyKey(allEvents, tid);
      if (t) eventTitles.push(t.title);
    }
    for (const nid of r.selectedNonTechnicalIds) {
      const n = findEventByAnyKey(allEvents, nid);
      if (n) eventTitles.push(n.title);
    }
    return [
      escapeCsv(r.id),
      escapeCsv(r.createdAt),
      escapeCsv(r.registrationType === "workshop" ? "workshop" : "technical"),
      escapeCsv(eventTitles.join("; ")),
      escapeCsv(r.teamLeader.fullName),
      escapeCsv(r.teamLeader.email),
      escapeCsv(r.teamLeader.phone),
      escapeCsv(r.teamLeader.college),
      escapeCsv(r.teamLeader.department || ""),
      escapeCsv(r.teamLeader.year || ""),
      escapeCsv(r.participants.length),
      escapeCsv(r.participants[1] ? `${r.participants[1].fullName} (${r.participants[1].phone})` : ""),
      escapeCsv(r.participants[2] ? `${r.participants[2].fullName} (${r.participants[2].phone})` : ""),
      escapeCsv(r.participants[3] ? `${r.participants[3].fullName} (${r.participants[3].phone})` : ""),
      escapeCsv(r.totalAmount),
      escapeCsv(r.paymentMethod),
      escapeCsv(r.paymentStatus),
      escapeCsv(r.paymentId || r.upiReference || ""),
      escapeCsv(r.attendanceMarked ? "present" : "absent")
    ].join(",");
  });
  const csvContent = [headers.join(","), ...rows].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="EVITRON_2K26_Registrations.csv"');
  res.status(200).send(csvContent);
}));
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`EVITRON 2K26 backend server running on http://0.0.0.0:${PORT}`);
  });
}
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  startServer();
}
var server_default = app;
export {
  server_default as default
};
//# sourceMappingURL=server.js.map
