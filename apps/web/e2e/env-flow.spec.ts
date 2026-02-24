import { expect, test } from '@playwright/test';

test('create project, create env, import vars, and display imported key', async ({ page }) => {
  const unique = Date.now().toString();
  const projectName = `e2e-project-${unique}`;
  const environmentName = `staging-${unique}`;

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your Projects' })).toBeVisible();

  await page.getByPlaceholder('Enter project name...').fill(projectName);
  const createProjectResponse = page.waitForResponse((response) => {
    return response.url().includes('/api/projects') && response.request().method() === 'POST';
  });
  await page.getByRole('button', { name: 'Create' }).click();
  const projectResponse = await createProjectResponse;
  expect(projectResponse.status()).toBe(201);

  await page.getByRole('link', { name: new RegExp(projectName) }).click();
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

  await page.getByPlaceholder('New env...').fill(environmentName);
  const createEnvForm = page.locator('form').filter({ has: page.getByPlaceholder('New env...') });
  await createEnvForm.locator('button[type="submit"]').click();

  await page.getByRole('button', { name: new RegExp(`^${environmentName} \\([0-9]+\\)$`) }).click();

  await page.getByPlaceholder(/Paste \.env content here/).fill('APP_NAME=envault-e2e\nAPI_KEY=super-secret-e2e\n');
  await page.getByRole('button', { name: `Import to ${environmentName}` }).click();

  await expect(page.getByText('APP_NAME')).toBeVisible();
  await expect(page.getByText('envault-e2e')).toBeVisible();
  await expect(page.getByText('API_KEY')).toBeVisible();
});
