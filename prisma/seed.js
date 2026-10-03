import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
async function main(){for(const name of ['STUDENT','LIBRARIAN','MANAGEMENT']){await prisma.role.upsert({where:{name},update:{},create:{name}});}console.log('Seeded roles');}
main().catch(e=>{console.error(e);process.exit(1);}).finally(async()=>await prisma.$disconnect());
