export type DemoProfile = {
  fullName: string;
  imageUrl?: string;
  emailAddress?: string;
};

export const demoProfile: DemoProfile = {
  fullName: "Guest User",
  imageUrl: "https://avatar.vercel.sh/guest.svg?text=GU",
  emailAddress: "guest@example.com",
};


