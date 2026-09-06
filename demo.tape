# Run from the repository root: vhs demo.tape
# Requires the installed plankton CLI and an active login to planka.ncssm.edu.
# Uses real Leviathan board data. All commands are read-only and safe to rerun.
Output docs/demo.gif

Require bash
Require plankton
Set Shell bash
Set Width 1400
Set Height 800
Set FontSize 22
Set Padding 24
Set Theme "Dracula"
Set TypingSpeed 35ms

Hide
Type `export PS1='$ '; unset PROMPT_COMMAND; set +o history`
Enter
Type "clear"
Enter
Sleep 500ms
Show

Type "# Plankton — robotics tasks from your terminal"
Enter
Type "plankton boards list --project Leviathan"
Enter
Sleep 3s
Type "plankton cards find --board 1534235156322190780 --query thruster"
Enter
Sleep 4s

Hide
Type "clear"
Enter
Show
Type "# Inspect a real task"
Enter
Type "plankton cards get 1645538627242951960"
Enter
Sleep 5s

Hide
Type "clear"
Enter
Show
Type "# Structured results for agents and scripts"
Enter
Type "plankton boards list --project Leviathan --limit 1 --json"
Enter
Sleep 5s
