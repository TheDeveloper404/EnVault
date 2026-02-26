#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { formatDiff } from '@envault/core';
import type { DiffResult } from '@envault/core';
import { Command } from 'commander';
import { apiFetch, apiFetchText } from './api.js';

const program = new Command();

program
  .name('envault')
  .description('EnVault CLI - Manage environment variables')
  .version('1.0.0');

// init command
program
  .command('init')
  .description('Initialize a new EnVault project')
  .requiredOption('-n, --name <name>', 'Project name')
  .option('-d, --description <desc>', 'Project description')
  .action(async (options) => {
    try {
      const project = await apiFetch('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: options.name,
          description: options.description
        })
      }) as { id: string; name: string };
      console.log(`Created project: ${project.name} (${project.id})`);
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

// push command
program
  .command('push')
  .description('Push .env file to EnVault')
  .requiredOption('-e, --env <env>', 'Environment name')
  .option('-f, --file <file>', 'Env file path', '.env')
  .option('-p, --project <project>', 'Project name (or uses first project)')
  .option('-o, --overwrite', 'Overwrite existing values', false)
  .action(async (options) => {
    try {
      // Get or find project
      let projectId = options.project;
      if (!projectId) {
        const projects = await apiFetch('/projects') as Array<{ id: string; name: string }>;
        if (projects.length === 0) {
          console.error('No projects found. Create one first with: envault init -n <name>');
          process.exit(1);
        }
        projectId = projects[0].id;
        console.log(`Using project: ${projects[0].name}`);
      } else {
        const projects = await apiFetch('/projects') as Array<{ id: string; name: string }>;
        const project = projects.find(p => p.name === projectId || p.id === projectId);
        if (!project) {
          console.error(`Project '${projectId}' not found`);
          process.exit(1);
        }
        projectId = project.id;
      }

      // Ensure environment exists
      try {
        await apiFetch(`/projects/${projectId}/environments`, {
          method: 'POST',
          body: JSON.stringify({ name: options.env })
        });
        console.log(`Created environment: ${options.env}`);
      } catch {
        // Environment already exists, that's fine
      }

      // Read and push env file
      const content = readFileSync(options.file, 'utf8');
      const result = await apiFetch(`/projects/${projectId}/envs/${options.env}/import`, {
        method: 'POST',
        body: JSON.stringify({ content, overwrite: options.overwrite })
      }) as { imported: number; updated: number; skipped: number };

      console.log(`Pushed: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped`);
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

// pull command
program
  .command('pull')
  .description('Pull .env file from EnVault')
  .requiredOption('-e, --env <env>', 'Environment name')
  .option('-f, --file <file>', 'Output file path', '.env')
  .option('-p, --project <project>', 'Project name (or uses first project)')
  .action(async (options) => {
    try {
      // Get or find project
      let projectId = options.project;
      if (!projectId) {
        const projects = await apiFetch('/projects') as Array<{ id: string; name: string }>;
        if (projects.length === 0) {
          console.error('No projects found');
          process.exit(1);
        }
        projectId = projects[0].id;
      } else {
        const projects = await apiFetch('/projects') as Array<{ id: string; name: string }>;
        const project = projects.find(p => p.name === projectId || p.id === projectId);
        if (!project) {
          console.error(`Project '${projectId}' not found`);
          process.exit(1);
        }
        projectId = project.id;
      }

      const content = await apiFetchText(`/projects/${projectId}/envs/${options.env}/export?mask=false`);
      writeFileSync(options.file, content);
      console.log(`Pulled environment '${options.env}' to ${options.file}`);
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

// validate command
program
  .command('validate')
  .description('Validate environment against schema')
  .option('-e, --env <env>', 'Environment name', 'local')
  .option('-p, --project <project>', 'Project name (or uses first project)')
  .action(async (options) => {
    try {
      // Get or find project
      let projectId = options.project;
      if (!projectId) {
        const projects = await apiFetch('/projects') as Array<{ id: string; name: string }>;
        if (projects.length === 0) {
          console.error('No projects found');
          process.exit(1);
        }
        projectId = projects[0].id;
      } else {
        const projects = await apiFetch('/projects') as Array<{ id: string; name: string }>;
        const project = projects.find(p => p.name === projectId || p.id === projectId);
        if (!project) {
          console.error(`Project '${projectId}' not found`);
          process.exit(1);
        }
        projectId = project.id;
      }

      const result = await apiFetch(`/projects/${projectId}/validate?env=${options.env}`) as {
        valid: boolean;
        errors: Array<{ key: string; message: string }>;
      };

      if (result.valid) {
        console.log(`Environment '${options.env}' is valid`);
      } else {
        console.log(`Environment '${options.env}' has issues:`);
        for (const error of result.errors) {
          console.log(`  - ${error.key}: ${error.message}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

// diff command
program
  .command('diff')
  .description('Compare two environments')
  .argument('<from>', 'Source environment')
  .argument('<to>', 'Target environment')
  .option('-p, --project <project>', 'Project name (or uses first project)')
  .action(async (from, to, options) => {
    try {
      // Get or find project
      let projectId = options.project;
      if (!projectId) {
        const projects = await apiFetch('/projects') as Array<{ id: string; name: string }>;
        if (projects.length === 0) {
          console.error('No projects found');
          process.exit(1);
        }
        projectId = projects[0].id;
      } else {
        const projects = await apiFetch('/projects') as Array<{ id: string; name: string }>;
        const project = projects.find(p => p.name === projectId || p.id === projectId);
        if (!project) {
          console.error(`Project '${projectId}' not found`);
          process.exit(1);
        }
        projectId = project.id;
      }

      const result = await apiFetch(`/projects/${projectId}/diff?from=${from}&to=${to}`) as DiffResult;

      if (!result.hasChanges) {
        console.log('No differences found');
        return;
      }

      console.log(formatDiff(result, 'text'));
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

// schema command
program
  .command('schema')
  .description('Upload schema from .env.example or env.schema.json')
  .requiredOption('-f, --file <file>', 'Schema file (.env.example or env.schema.json)')
  .option('-p, --project <project>', 'Project name (or uses first project)')
  .action(async (options) => {
    try {
      // Get or find project
      let projectId = options.project;
      if (!projectId) {
        const projects = await apiFetch('/projects') as Array<{ id: string; name: string }>;
        if (projects.length === 0) {
          console.error('No projects found');
          process.exit(1);
        }
        projectId = projects[0].id;
      } else {
        const projects = await apiFetch('/projects') as Array<{ id: string; name: string }>;
        const project = projects.find(p => p.name === projectId || p.id === projectId);
        if (!project) {
          console.error(`Project '${projectId}' not found`);
          process.exit(1);
        }
        projectId = project.id;
      }

      const content = readFileSync(options.file, 'utf8');
      await apiFetch(`/projects/${projectId}/schema`, {
        method: 'POST',
        body: JSON.stringify({ content })
      });

      console.log('Schema uploaded successfully');
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program.parse();
