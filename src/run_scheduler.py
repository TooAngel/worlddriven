from PullRequest import check_pull_requests
import logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s %(message)s',
                    handlers=[logging.StreamHandler()])

if __name__ == '__main__':
    check_pull_requests()
