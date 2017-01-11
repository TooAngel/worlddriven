# democratic-collaboration

Usually in open source projects there is one or more people responsible to finally merge features and fixes in to the master branch. Due lack of time or interest this can be a bottleneck.

Democratic collaboration introduces a contribution based weighted voting system for merging. As soon as you contribute to a project, you get a share or responsiblity for the progress of the project.
Currently it is based on the github Pull Request workflow.

Weigted votes are based on the commits (currently). 

If a PR is ready for merge a voting is started (starting `value` 0):
 - If a reviewer 'Request changes' the `value` descreased by there contribution value.
 - If a reviewer 'Apporave' the `value increases by there contribution value.
 - After the last Review interaction with the PR:
   - `value` < 0 - not merged
   - `value` > '50%' of total in 3 days
   - `value` > '75%' of total in 1 day
   - `value` = total now
   - otherwise in 7 days
