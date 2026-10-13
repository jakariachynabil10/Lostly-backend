import { PrismaClient, ReportType, ReportStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateReportSimilarity } from "../src/utils/similarity";

const prisma = new PrismaClient();

const categories = [
  "Electronics",
  "Mobile Phone",
  "Laptop",
  "Tablet",
  "Headphones",
  "Wallet",
  "Bag",
  "Keys",
  "ID Card",
  "Passport",
  "Books",
  "Clothing",
  "Accessories",
  "Other",
];

async function main() {
  console.log("Seeding categories...");
  const categoryMap = new Map<string, string>();

  for (const name of categories) {
    const cat = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categoryMap.set(name, cat.id);
  }
  console.log(`Seeded ${categories.length} categories.`);

  console.log("Seeding demo users...");
  const hashedPassword = await bcrypt.hash("password123", 10);

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@lostly.com" },
    update: {},
    create: {
      name: "Alex Rivera",
      email: "demo@lostly.com",
      password: hashedPassword,
      profileImage: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    },
  });

  const finderUser = await prisma.user.upsert({
    where: { email: "finder@lostly.com" },
    update: {},
    create: {
      name: "Sam Finder",
      email: "finder@lostly.com",
      password: hashedPassword,
      profileImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    },
  });
  console.log("Seeded demo users (demo@lostly.com / password123).");

  // Check if sample reports already exist
  const existingCount = await prisma.itemReport.count();
  if (existingCount === 0) {
    console.log("Seeding realistic matching pairs...");

    // 1. Lost iPhone
    const lostPhone = await prisma.itemReport.create({
      data: {
        userId: demoUser.id,
        type: ReportType.LOST,
        categoryId: categoryMap.get("Mobile Phone")!,
        itemName: "iPhone 15 Pro Max",
        brand: "Apple",
        color: "Titanium Blue",
        location: "Central Library 3rd Floor Study Room",
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        approximateTime: "3:30 PM",
        imageUrl: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80",
        description: "Dark blue iPhone 15 Pro Max with a transparent clear case and small sticker on the back. Has critical work contacts.",
        identifyingFeatures: "Clear ESR silicone case, faint scratch near lower charging port",
        status: ReportStatus.ACTIVE,
      },
    });

    // 2. Found iPhone (Matching pair!)
    const foundPhone = await prisma.itemReport.create({
      data: {
        userId: finderUser.id,
        type: ReportType.FOUND,
        categoryId: categoryMap.get("Mobile Phone")!,
        itemName: "Apple iPhone 15 Pro",
        brand: "Apple",
        color: "Blue",
        location: "Central Library 3rd Floor Desk 12",
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        approximateTime: "4:00 PM",
        imageUrl: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600&auto=format&fit=crop&q=80",
        description: "Blue iPhone found left on a study desk after student left. Has clear case, kept safely at reception.",
        identifyingFeatures: "Transparent case, tiny scuff by charging port",
        status: ReportStatus.ACTIVE,
      },
    });

    // 3. Lost Wallet
    const lostWallet = await prisma.itemReport.create({
      data: {
        userId: demoUser.id,
        type: ReportType.LOST,
        categoryId: categoryMap.get("Wallet")!,
        itemName: "Black Leather Bi-Fold Wallet",
        brand: "Bellroy",
        color: "Black",
        location: "Downtown Coffee Bean & Tea Leaf",
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        approximateTime: "11:15 AM",
        imageUrl: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=600&auto=format&fit=crop&q=80",
        description: "Slim black leather wallet containing driver's license and metro transit pass. Extremely important documents.",
        identifyingFeatures: "Embossed small owl logo on corner, MetroCard inside right slot",
        status: ReportStatus.ACTIVE,
      },
    });

    // 4. Found Wallet (Matching pair!)
    const foundWallet = await prisma.itemReport.create({
      data: {
        userId: finderUser.id,
        type: ReportType.FOUND,
        categoryId: categoryMap.get("Wallet")!,
        itemName: "Men's Black Leather Wallet",
        brand: "Bellroy",
        color: "Black",
        location: "Coffee Bean on Main Street Downtown",
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        approximateTime: "12:00 PM",
        imageUrl: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=600&auto=format&fit=crop&q=80",
        description: "Found leather wallet dropped under corner couch table. Handed to cafe shift supervisor.",
        identifyingFeatures: "Contains transit card and ID",
        status: ReportStatus.ACTIVE,
      },
    });

    // 5. Additional items
    await prisma.itemReport.create({
      data: {
        userId: demoUser.id,
        type: ReportType.LOST,
        categoryId: categoryMap.get("Keys")!,
        itemName: "Keyring with Toyota Fob & Red Lanyard",
        brand: "Toyota",
        color: "Silver & Red",
        location: "Metro Blue Line Station",
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        description: "Car key for 2022 RAV4 with house key, gym tag, and red fabric lanyard.",
        status: ReportStatus.ACTIVE,
      },
    });

    await prisma.itemReport.create({
      data: {
        userId: finderUser.id,
        type: ReportType.FOUND,
        categoryId: categoryMap.get("Headphones")!,
        itemName: "Sony WH-1000XM5 Noise Cancelling Headphones",
        brand: "Sony",
        color: "Silver",
        location: "University Student Center Lounge",
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        imageUrl: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&auto=format&fit=crop&q=80",
        description: "Found premium headphones in grey zipper hard case left on sofa.",
        identifyingFeatures: "Grey hard zippered case with charging cable",
        status: ReportStatus.ACTIVE,
      },
    });

    // Compute matches for the seeded pairs
    console.log("Calculating match engine similarity scores for seeded items...");
    const pairsToMatch = [
      { lost: lostPhone, found: foundPhone, catName: "Mobile Phone" },
      { lost: lostWallet, found: foundWallet, catName: "Wallet" },
    ];

    for (const pair of pairsToMatch) {
      const matchResult = calculateReportSimilarity(
        {
          itemName: pair.lost.itemName,
          categoryId: pair.lost.categoryId,
          categoryName: pair.catName,
          brand: pair.lost.brand,
          color: pair.lost.color,
          description: pair.lost.description,
          identifyingFeatures: pair.lost.identifyingFeatures,
          location: pair.lost.location,
          date: pair.lost.date,
          imageUrl: pair.lost.imageUrl,
        },
        {
          itemName: pair.found.itemName,
          categoryId: pair.found.categoryId,
          categoryName: pair.catName,
          brand: pair.found.brand,
          color: pair.found.color,
          description: pair.found.description,
          identifyingFeatures: pair.found.identifyingFeatures,
          location: pair.found.location,
          date: pair.found.date,
          imageUrl: pair.found.imageUrl,
        }
      );

      console.log(`Matched "${pair.lost.itemName}" & "${pair.found.itemName}": Score ${matchResult.similarityScore}% (${matchResult.tier})`);

      await prisma.match.create({
        data: {
          lostReportId: pair.lost.id,
          foundReportId: pair.found.id,
          similarityScore: matchResult.similarityScore,
          matchingFactors: matchResult.matchingFactors as any,
        },
      });

      await prisma.itemReport.update({
        where: { id: pair.lost.id },
        data: { status: ReportStatus.MATCH_FOUND },
      });

      await prisma.itemReport.update({
        where: { id: pair.found.id },
        data: { status: ReportStatus.MATCH_FOUND },
      });
    }

    console.log("Successfully seeded matching test reports and calculated scores!");
  }
}

main()
  .catch((e) => {
    console.error("Error during database seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
