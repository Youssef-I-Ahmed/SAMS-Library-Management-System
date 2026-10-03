import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
const server=app.listen(env.API_PORT,()=>console.log(`SAMS API running on http://localhost:${env.API_PORT}`));
async function shutdown(signal){console.log(`\n${signal} received. Shutting down...`);server.close(async()=>{await prisma.$disconnect();process.exit(0);});}
process.on('SIGINT',()=>shutdown('SIGINT'));process.on('SIGTERM',()=>shutdown('SIGTERM'));
