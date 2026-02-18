# Fix Bug with Auto-PR

## Configuration

**Artifacts Path**: {@artifacts_path}

**Description**: Bug fix workflow with investigation, automatic testing, PR creation, and notifications at key stages.

---

### [x] Step: Load Configuration
<!-- chat-id: 1e9e653a-ff37-4f01-984f-832b2fc59cb8 -->

Load project environment variables for workflow automation.

**Objectives**:
- Check for `.env` file in project root
- Load all environment variables that start with `ZENFLOW_`
- Store them for use in subsequent steps
- Log clear messages about configuration status

**Behavior**:
- If `.env` file not found: Log message "No .env file found in project root. Continuing without environment configuration."
- If `.env` exists but no `ZENFLOW_*` variables: Log message "No ZENFLOW_* environment variables found in .env file. Automation features may be limited."
- If `ZENFLOW_*` variables loaded: Log success message with count of variables loaded

**Acceptance Criteria**:
- Configuration loading attempted
- Clear logging provided to developer
- Workflow continues regardless of configuration state

**Artifacts**: Create `{@artifacts_path}/config.md` documenting loaded variables (without exposing sensitive values).

---

### [x] Step: Investigation & Planning
<!-- chat-id: 4b2472fe-2899-48a5-97b7-7300d6c4b586 -->

Investigate the reported issue, identify root cause, and plan the fix.

**Objectives**:
- Reproduce the bug if possible
- Identify the root cause of the issue
- Determine the scope and impact of the bug
- Plan a targeted solution that addresses the root cause
- Notify developer of findings and planned approach

**Investigation includes**:
- Reviewing relevant code and dependencies
- Analyzing error logs or stack traces if available
- Identifying edge cases that trigger the bug
- Determining if similar issues exist elsewhere

**Planning includes**:
- Outlining the fix approach
- Identifying files and components that need changes
- Planning test strategy to verify the fix
- Considering potential side effects or regressions

**Notification via ntfy**:

MCP Tool: `send_ntfy`

Parameters:
- `topic`: Value from `ZENFLOW_PROJECT_TOPIC` environment variable
- `title`: "Issue Found: [mm/dd/yy] - [project_name]"
  - Use current date in mm/dd/yy format
  - Use the repository/project name
  - Example: "Issue Found: 01/21/26 - zenflow-app"
- `message`: Include:
  - Brief explanation of what the bug is
  - Root cause if identified
  - Planned fix approach
  - If Auto-start steps is enabled: "Proceeding with implementation automatically."
  - If Auto-start steps is NOT enabled: "Fix is ready to be implemented. The next step is ready to start when you're ready."
- `priority`: "default"
- `tags`: ["zenflow", "bugfix", "[project_name]"]
  - Include the repository/project name as a tag
  - Example: ["zenflow", "bugfix", "zenflow-app"]

Behavior:
- If `ZENFLOW_PROJECT_TOPIC` is set: Send notification automatically
- If `ZENFLOW_PROJECT_TOPIC` is not set: Skip notification and inform developer in chat with message: "Notification skipped - ZENFLOW_PROJECT_TOPIC environment variable not found in .env file."

**DO NOT ask for permission** - execute notification automatically when topic is configured.

**Acceptance Criteria**:
- Bug reproduced and root cause identified (or clearly documented if not reproducible)
- Fix plan documented with clear approach
- Developer notified of findings and next steps

**Artifacts**: Create `{@artifacts_path}/investigation-report.md` with bug analysis, root cause, and fix plan.

---

### [x] Step: Implementation
<!-- chat-id: 04c5228e-9e9f-4e35-bd30-e09c79424680 -->

Implement the bug fix with appropriate testing to verify the issue is resolved.

**Objectives**:
- Write or update test(s) that will catch this bug in the future (do this FIRST)
- Implement the planned fix
- Verify the fix resolves the issue
- Follow project coding standards
- Update documentation if needed

**Implementation order**:
1. **First**: Write or update test(s) that will fail with the current bug and pass once fixed
   - This ensures the bug can be caught by automated testing going forward
   - Test should specifically target the root cause identified in investigation
2. **Second**: Implement the fix according to the plan
3. **Third**: Run tests to verify the fix works and doesn't introduce regressions

**Testing requirements**:
- Run the specific test(s) written/updated for this bug
- Run related tests that could be affected by the fix
- For critical or complex bugs: Run broader test suites as appropriate
- Verify the original bug scenario no longer occurs

**Acceptance Criteria**:
- New/updated test(s) written that catch this bug
- Fix implemented according to plan
- All relevant tests passing
- Code follows project standards from `agent_rules.md`
- Module `docs.md` updated if functionality changed

**Artifacts**: Create `{@artifacts_path}/implementation-report.md` documenting the fix, tests added/updated, and verification results.

---

### [ ] Step: Create PR For Review
<!-- chat-id: 4e07ea75-2c44-4800-9b83-536a151bdcd5 -->

Create GitHub pull request and send notification via ntfy.

**Objectives**:
- Create PR using GitHub MCP tools
- Send push notification if configured
- Provide developer with PR link and status

Formatting Note for MCP tool string parameters: 
- Write string content naturally with actual formatting (newlines, indentation, etc.) rather than using escape sequences like \n or \t. The tool interface handles JSON encoding automatically.

**GitHub PR Creation**:

MCP Tool: `create_pull_request`

Parameters:
- `owner`: Repository owner username
- `repo`: Repository name  
- `title`: "Bug Fix: [task-name]"
- `body`: Summary from investigation and implementation reports, including:
  - What the bug was
  - Root cause
  - How it was fixed
  - Tests added/updated
- `head`: Current worktree branch
- `base`: "main" (or configured base branch)

**DO NOT ask for permission** - execute automatically.

**Notification via ntfy**:

MCP Tool: `send_ntfy`

Parameters:
- `topic`: Value from `ZENFLOW_PROJECT_TOPIC` environment variable
- `title`: "New PR: [mm/dd/yy] - [project_name] - [PR title]"
  - Use current date in mm/dd/yy format
  - Use the repository/project name
  - Include the actual PR title
  - Example: "New PR: 01/21/26 - zenflow-app - Bug Fix: Checkout validation error"
- `message`: Brief description of the fix from implementation report
- `priority`: "high"
- `click_url`: GitHub PR URL
- `tags`: ["zenflow", "github", "pull-request", "[project_name]"]
  - Include the repository/project name as a tag for filtering
  - Example: ["zenflow", "github", "pull-request", "zenflow-app"]

Behavior:
- If `ZENFLOW_PROJECT_TOPIC` is set: Send notification automatically
- If `ZENFLOW_PROJECT_TOPIC` is not set: Skip notification and inform developer in chat with message: "Notification skipped - ZENFLOW_PROJECT_TOPIC environment variable not found in .env file."

**DO NOT ask for permission** - execute automatically when topic is configured.

**Acceptance Criteria**:
- PR created successfully on GitHub
- Notification sent (if configured) or skip reason communicated
- Developer provided with PR link

**Artifacts**: Create `{@artifacts_path}/pr-summary.md` with PR URL, title, description, and notification status.
